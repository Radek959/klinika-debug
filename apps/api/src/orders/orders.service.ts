import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type MedicalTest } from "@prisma/client";
import { createHash } from "node:crypto";
import {
  calculateRequiredMaterials,
  findDuplicateMedicalTestSelections,
  validateOrderAdditionalData,
  normalizeSearch,
  parseDate,
  normalizeCreatedToDate,
  validateDateRange,
  canTransitionOrderStatus,
  validateCollectedAt,
  determineOrderStatusAfterSampleCollection,
  canSendOrder,
  buildSendIdempotencyKey,
  calculateRequiredMaterials as calculateRequiredOrderMaterials,
  canEditDraftOrder,
  getDraftOrderChangeSet,
  hasDraftOrderChanges,
  mergeDraftOrderPatch,
  buildOrderCreatedDetails,
  buildOrderUpdatedDetails,
  buildSampleRegisteredDetails,
  buildOrderSentToLabDetails,
  buildLabOrderAcceptedDetails,
  buildLabOrderRejectedDetails,
  buildLabRateLimitReceivedDetails,
  buildLabSendRetryDetails,
  computeRetryAfterSeconds,
  FIRST_LAB_SEND_ATTEMPT_NUMBER,
  LAB_RATE_LIMITED_ERROR_CODE,
  LAB_RATE_LIMITED_MESSAGE,
  type NormalizedOrderTestSelection,
  type OrderMedicalTestDefinition,
  type OrderValidationFieldError,
  type OrdersListValidationError,
  type OrderStatus,
  type DraftOrderState
} from "@klinika/domain";
import type {
  CreateOrderRequest,
  OrderResponse,
  OrdersListResponse,
  OrdersListParams,
  OrderDetailsResponse,
  OrderHistoryListResponse,
  RegisterSampleRequest,
  UpdateOrderRequest
} from "@klinika/api-contracts";
import { ApiErrorException } from "../common/errors/api-error.exception";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  LabSimulatorService,
  type LabSimulatorOrderAccepted,
  type LabSimulatorOrderRateLimited
} from "../lab-simulator/lab-simulator.service";
import { resolveLabSimulatorScenario } from "../lab-simulator/lab-simulator-scenario";
import {
  OrderHistoryService,
  type OrderHistoryListParams
} from "../order-history/order-history.service";
import { toOrderResponse, toOrderListResponse, toOrderDetailsResponse } from "./orders.mapper";

/**
 * Znacznik stanu klucza idempotencji dla wysyłki oczekującej na automatyczne
 * ponowienie. Rozstrzygający jest `responseStatus` (429); to pole jest jawnym,
 * czytelnym opisem stanu w danych technicznych.
 */
const PENDING_SEND_RETRY_STATE = "PENDING_SEND_RETRY";

type MedicalTestWithRequiredFields = MedicalTest & {
  requiredFields: Array<{
    code: string;
    valueType: "BOOLEAN" | "TEXT";
    required: boolean;
  }>;
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly labSimulator: LabSimulatorService,
    private readonly orderHistory: OrderHistoryService
  ) {}

  async create(
    workspaceId: string,
    createdByUserId: string,
    input: CreateOrderRequest
  ): Promise<OrderResponse> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: input.patientId, workspaceId },
      select: { id: true, active: true }
    });

    if (!patient) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        "PATIENT_NOT_FOUND",
        "Nie znaleziono pacjenta."
      );
    }

    if (!patient.active) {
      throw this.orderValidationError([
        { field: "patientId", code: "PATIENT_INACTIVE" }
      ]);
    }

    const validation = await this.validateOrderInput(input);
    if (!validation.valid) {
      throw this.orderValidationError(validation.errors);
    }

    const sortedCatalog = [...validation.catalog].sort((a, b) =>
      a.code.localeCompare(b.code)
    );
    const normalizedById = new Map(
      validation.tests.map((test) => [test.medicalTestId, test])
    );
    const sampleMaterials = calculateRequiredMaterials(validation.catalog);

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          workspaceId,
          patientId: patient.id,
          createdByUserId,
          priority: input.priority,
          status: "DRAFT"
        }
      });

      const orderTests = [];
      for (const catalogItem of sortedCatalog) {
        const normalized = normalizedById.get(catalogItem.id);
        const orderTest = await tx.orderTest.create({
          data: {
            workspaceId,
            orderId: order.id,
            medicalTestId: catalogItem.id,
            additionalData: this.toPrismaJson(normalized?.additionalData ?? null)
          },
          include: {
            medicalTest: {
              select: { code: true, name: true, materialType: true }
            }
          }
        });
        orderTests.push(orderTest);
      }

      const samples = [];
      for (const materialType of sampleMaterials) {
        samples.push(
          await tx.sample.create({
            data: {
              workspaceId,
              orderId: order.id,
              materialType,
              status: "REQUIRED",
              barcode: null,
              collectedAt: null,
              collectedByUserId: null,
              rejectionCode: null,
              rejectionReason: null
            }
          })
        );
      }

      await this.orderHistory.record(tx, {
        workspaceId,
        orderId: order.id,
        eventType: "ORDER_CREATED",
        actorType: "STAFF",
        actorUserId: createdByUserId,
        previousStatus: null,
        newStatus: "DRAFT",
        details: buildOrderCreatedDetails({
          priority: input.priority,
          testCodes: sortedCatalog.map((catalogItem) => catalogItem.code),
          requiredMaterials: sampleMaterials,
          finalStatus: "DRAFT"
        })
      });

      return { order, orderTests, samples };
    });

    return toOrderResponse(result.order, result.orderTests, result.samples);
  }

  async list(
    workspaceId: string,
    params: OrdersListParams
  ): Promise<OrdersListResponse> {
    const validationErrors = this.validateListParams(params);
    if (validationErrors.length > 0) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Żądanie zawiera nieprawidłowe dane.",
        validationErrors.map((error) => ({
          field: error.field,
          code: error.code,
          message: this.listParamErrorMessage(error.code)
        }))
      );
    }

    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 20, 100);
    const skip = (page - 1) * pageSize;

    const normalizedSearchTerm = normalizeSearch(params.search);
    const sortField = params.sort ?? "updatedAt";
    const sortOrder = params.order ?? "desc";

    const where = this.buildWhereClause(workspaceId, params, normalizedSearchTerm);
    const orderBy = this.buildOrderBy(sortField, sortOrder);

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          patient: true,
          tests: {
            include: {
              medicalTest: {
                select: { code: true, name: true, materialType: true }
              }
            }
          },
          samples: true
        },
        orderBy,
        skip,
        take: pageSize
      }),
      this.prisma.order.count({ where })
    ]);

    return toOrderListResponse(items, page, pageSize, total);
  }

  async getById(workspaceId: string, orderId: string): Promise<OrderDetailsResponse> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, workspaceId },
      include: {
        patient: true,
        tests: {
          include: {
            medicalTest: {
              select: { code: true, name: true, materialType: true }
            }
          },
          orderBy: {
            medicalTest: { code: "asc" }
          }
        },
        samples: {
          orderBy: {
            materialType: "asc"
          }
        },
        results: true
      }
    });

    if (!order) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        "ORDER_NOT_FOUND",
        "Nie znaleziono zlecenia."
      );
    }

    return toOrderDetailsResponse(order);
  }

  async getHistory(
    workspaceId: string,
    orderId: string,
    params: OrderHistoryListParams
  ): Promise<OrderHistoryListResponse> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, workspaceId },
      select: { id: true }
    });

    if (!order) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        "ORDER_NOT_FOUND",
        "Nie znaleziono zlecenia."
      );
    }

    return this.orderHistory.list(workspaceId, orderId, params);
  }

  async updateDraft(
    workspaceId: string,
    orderId: string,
    actorUserId: string,
    input: UpdateOrderRequest
  ): Promise<OrderResponse> {
    if (!this.hasPatchShape(input)) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "PATCH musi zawierać co najmniej jedno pole do aktualizacji.",
        [
          {
            field: "body",
            code: "EMPTY_PATCH",
            message: "PATCH musi zawierać co najmniej jedno pole do aktualizacji."
          }
        ]
      );
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, workspaceId },
      include: {
        tests: {
          include: {
            medicalTest: {
              select: {
                id: true,
                code: true,
                name: true,
                materialType: true,
                requiredFields: {
                  select: { code: true, valueType: true, required: true }
                }
              }
            }
          },
          orderBy: {
            medicalTest: { code: "asc" }
          }
        },
        samples: {
          orderBy: {
            materialType: "asc"
          }
        }
      }
    });

    if (!order) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        "ORDER_NOT_FOUND",
        "Nie znaleziono zlecenia."
      );
    }

    if (!canEditDraftOrder(order.status)) {
      throw this.orderUpdateError([
        { field: "status", code: "ORDER_NOT_EDITABLE" }
      ]);
    }

    const currentState = this.toDraftOrderState(order);
    const finalPatientId = input.patientId ?? order.patientId;
    let validationCatalog: MedicalTestWithRequiredFields[] | undefined;
    let normalizedPatchTests: NormalizedOrderTestSelection[] | undefined;

    if (input.tests !== undefined) {
      const validation = await this.validateOrderInput({ tests: input.tests });
      if (!validation.valid) {
        throw this.orderUpdateError(validation.errors);
      }
      validationCatalog = validation.catalog;
      normalizedPatchTests = validation.tests;
    }

    const nextState = mergeDraftOrderPatch(currentState, {
      patientId: finalPatientId,
      priority: input.priority,
      tests: normalizedPatchTests
    });
    const changes = getDraftOrderChangeSet(currentState, nextState);

    if (!hasDraftOrderChanges(changes)) {
      throw this.orderUpdateError([
        { field: "body", code: "NO_CHANGES" }
      ]);
    }

    if (changes.patientChanged) {
      const patient = await this.prisma.patient.findFirst({
        where: { id: finalPatientId, workspaceId },
        select: { id: true, active: true }
      });

      if (!patient) {
        throw new ApiErrorException(
          HttpStatus.NOT_FOUND,
          "PATIENT_NOT_FOUND",
          "Nie znaleziono pacjenta."
        );
      }

      if (!patient.active) {
        throw this.orderUpdateError([
          { field: "patientId", code: "PATIENT_INACTIVE" }
        ]);
      }
    }

    const previousTestCodes = order.tests.map((test) => test.medicalTest.code);
    const testCodeById = new Map(
      (validationCatalog ?? []).map((catalogItem) => [catalogItem.id, catalogItem.code])
    );
    const nextTestCodes = changes.testsChanged
      ? nextState.tests.map(
          (test) => testCodeById.get(test.medicalTestId) ?? test.medicalTestId
        )
      : previousTestCodes;

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      if (changes.patientChanged || changes.priorityChanged) {
        await tx.order.update({
          where: { id: order.id },
          data: {
            patientId: changes.patientChanged ? nextState.patientId : undefined,
            priority: changes.priorityChanged ? nextState.priority : undefined
          }
        });
      }

      if (changes.testsChanged && validationCatalog) {
        const targetById = new Map(nextState.tests.map((test) => [test.medicalTestId, test]));
        const currentById = new Map(order.tests.map((test) => [test.medicalTestId, test]));
        const targetIds = [...targetById.keys()];

        await tx.orderTest.deleteMany({
          where: {
            workspaceId,
            orderId: order.id,
            medicalTestId: { notIn: targetIds }
          }
        });

        const sortedCatalog = [...validationCatalog].sort((a, b) =>
          a.code.localeCompare(b.code)
        );

        for (const catalogItem of sortedCatalog) {
          const normalized = targetById.get(catalogItem.id);
          if (!normalized) {
            continue;
          }

          const data = this.toPrismaJson(normalized.additionalData);
          const existing = currentById.get(catalogItem.id);
          if (existing) {
            await tx.orderTest.update({
              where: { id: existing.id },
              data: { additionalData: data }
            });
          } else {
            await tx.orderTest.create({
              data: {
                workspaceId,
                orderId: order.id,
                medicalTestId: catalogItem.id,
                additionalData: data
              }
            });
          }
        }

        const requiredMaterials = calculateRequiredOrderMaterials(validationCatalog);
        await tx.sample.deleteMany({
          where: {
            workspaceId,
            orderId: order.id,
            materialType: { notIn: requiredMaterials }
          }
        });

        const existingMaterials = new Set(
          order.samples.map((sample) => sample.materialType)
        );
        for (const materialType of requiredMaterials) {
          if (existingMaterials.has(materialType)) {
            continue;
          }
          await tx.sample.create({
            data: {
              workspaceId,
              orderId: order.id,
              materialType,
              status: "REQUIRED",
              barcode: null,
              collectedAt: null,
              collectedByUserId: null,
              rejectionCode: null,
              rejectionReason: null
            }
          });
        }
      }

      await this.orderHistory.record(tx, {
        workspaceId,
        orderId: order.id,
        eventType: "ORDER_UPDATED",
        actorType: "STAFF",
        actorUserId,
        details: buildOrderUpdatedDetails({
          patientChanged: changes.patientChanged,
          priorityChanged: changes.priorityChanged,
          previousPriority: currentState.priority,
          newPriority: nextState.priority,
          previousTestCodes,
          nextTestCodes
        })
      });

      return tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          tests: {
            include: {
              medicalTest: { select: { code: true, name: true, materialType: true } }
            },
            orderBy: {
              medicalTest: { code: "asc" }
            }
          },
          samples: {
            orderBy: {
              materialType: "asc"
            }
          }
        }
      });
    });

    return toOrderResponse(updatedOrder, updatedOrder.tests, updatedOrder.samples);
  }

  async registerSample(
    workspaceId: string,
    orderId: string,
    userId: string,
    input: RegisterSampleRequest
  ): Promise<OrderResponse> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, workspaceId },
      include: {
        tests: {
          include: {
            medicalTest: { select: { code: true, name: true, materialType: true } }
          },
          orderBy: {
            medicalTest: { code: "asc" }
          }
        },
        samples: {
          orderBy: {
            materialType: "asc"
          }
        }
      }
    });

    if (!order) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        "ORDER_NOT_FOUND",
        "Nie znaleziono zlecenia."
      );
    }

    const fieldErrors: { field: string; code: string }[] = [];

    const editableStatuses: OrderStatus[] = [
      "DRAFT",
      "SAMPLE_COLLECTION_IN_PROGRESS"
    ];
    if (!editableStatuses.includes(order.status)) {
      fieldErrors.push({ field: "status", code: "ORDER_NOT_EDITABLE" });
    }

    const sample = order.samples.find(
      (candidate) => candidate.materialType === input.materialType
    );
    if (!sample) {
      fieldErrors.push({ field: "materialType", code: "MATERIAL_TYPE_NOT_REQUIRED" });
    } else if (sample.status !== "REQUIRED") {
      fieldErrors.push({ field: "materialType", code: "SAMPLE_ALREADY_COLLECTED" });
    }

    const collectedAt = new Date(input.collectedAt);
    if (sample && fieldErrors.length === 0) {
      fieldErrors.push(...validateCollectedAt(collectedAt, order.createdAt));
    }

    if (fieldErrors.length === 0) {
      const duplicateBarcode = await this.prisma.sample.findFirst({
        where: { workspaceId, barcode: input.barcode }
      });
      if (duplicateBarcode) {
        fieldErrors.push({ field: "barcode", code: "DUPLICATE_BARCODE" });
      }
    }

    if (fieldErrors.length > 0) {
      throw this.sampleRegistrationError(fieldErrors);
    }

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      try {
        await tx.sample.update({
          where: { id: sample!.id },
          data: {
            barcode: input.barcode,
            collectedAt,
            collectedByUserId: userId,
            status: "COLLECTED"
          }
        });
      } catch (error) {
        this.mapSampleRegistrationConflict(error);
      }

      const samples = await tx.sample.findMany({ where: { workspaceId, orderId } });
      const nextStatus = determineOrderStatusAfterSampleCollection(
        samples.map((current) => current.status)
      );

      const statusToPersist =
        nextStatus !== order.status && canTransitionOrderStatus(order.status, nextStatus)
          ? nextStatus
          : order.status;

      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: statusToPersist },
        include: {
          tests: {
            include: {
              medicalTest: { select: { code: true, name: true, materialType: true } }
            },
            orderBy: {
              medicalTest: { code: "asc" }
            }
          },
          samples: {
            orderBy: {
              materialType: "asc"
            }
          }
        }
      });

      await this.orderHistory.record(tx, {
        workspaceId,
        orderId,
        eventType: "SAMPLE_REGISTERED",
        actorType: "STAFF",
        actorUserId: userId,
        previousStatus: order.status,
        newStatus: statusToPersist,
        details: buildSampleRegisteredDetails({
          materialType: input.materialType,
          sampleId: sample!.id,
          previousOrderStatus: order.status,
          newOrderStatus: statusToPersist
        })
      });

      return updated;
    });

    return toOrderResponse(updatedOrder, updatedOrder.tests, updatedOrder.samples);
  }

  async sendOrder(
    workspaceId: string,
    orderId: string,
    actorUserId: string,
    correlationId: string
  ): Promise<OrderResponse> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, workspaceId },
      include: {
        patient: { select: { active: true } },
        tests: {
          include: {
            medicalTest: {
              select: {
                code: true,
                name: true,
                materialType: true,
                parameters: {
                  select: { code: true, valueType: true, unit: true }
                }
              }
            }
          },
          orderBy: {
            medicalTest: { code: "asc" }
          }
        },
        samples: {
          orderBy: {
            materialType: "asc"
          }
        }
      }
    });

    if (!order) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        "ORDER_NOT_FOUND",
        "Nie znaleziono zlecenia."
      );
    }

    const idempotencyKey = buildSendIdempotencyKey(orderId);
    const requestHash = this.hashSendRequest(order);

    const existingKey = await this.prisma.idempotencyKey.findUnique({
      where: { workspaceId_key: { workspaceId, key: idempotencyKey } }
    });

    if (existingKey) {
      if (existingKey.requestHash !== requestHash) {
        throw new ApiErrorException(
          HttpStatus.CONFLICT,
          "IDEMPOTENCY_KEY_CONFLICT",
          "Zlecenie zostało już wysłane z innymi danymi."
        );
      }

      // Wysyłka oczekująca na automatyczne ponowienie nie może udawać sukcesu:
      // zlecenie nie zostało jeszcze przyjęte przez laboratorium.
      if (existingKey.responseStatus === HttpStatus.TOO_MANY_REQUESTS) {
        throw await this.buildPendingRetryError(workspaceId, orderId);
      }

      // Ponowne żądanie z tym samym payloadem: zwróć bieżący, już zaktualizowany stan zlecenia.
      return toOrderResponse(order, order.tests, order.samples);
    }

    const fieldErrors: { field: string; code: string }[] = [];
    if (!canSendOrder(order.status)) {
      fieldErrors.push({ field: "status", code: "ORDER_NOT_SENDABLE" });
    }
    if (!order.patient.active) {
      fieldErrors.push({ field: "patientId", code: "PATIENT_INACTIVE" });
    }
    if (fieldErrors.length > 0) {
      throw this.orderSendError(fieldErrors);
    }

    const scenario = resolveLabSimulatorScenario();
    const simulatorResult = this.labSimulator.acceptOrder({
      workspaceId,
      orderId,
      correlationId,
      // Pierwsza, ręczna próba wysyłki. Licznik prób nie jest trzymany w pamięci
      // procesu — kolejne próby czytają swój numer z trwałego zadania ponowienia.
      attemptNumber: FIRST_LAB_SEND_ATTEMPT_NUMBER,
      scenario,
      tests: order.tests.map((test) => ({
        medicalTestId: test.medicalTestId,
        code: test.medicalTest.code,
        materialType: test.medicalTest.materialType,
        parameters: test.medicalTest.parameters
      })),
      // Symulator dostaje tylko identyfikator i rodzaj materiału próbki —
      // bez kodu kreskowego, danych pacjenta i innych danych wrażliwych.
      samples: order.samples.map((sample) => ({
        sampleId: sample.id,
        materialType: sample.materialType
      }))
    });

    if (!simulatorResult.accepted && simulatorResult.rejectionType === "RATE_LIMIT") {
      // Laboratorium chwilowo ograniczyło liczbę żądań. W odróżnieniu od
      // odrzucenia walidacyjnego (422) ta odpowiedź MA zostać automatycznie
      // ponowiona, więc atomowo rezerwujemy klucz idempotencji, planujemy
      // dokładnie jedno trwałe zadanie ponowienia i zapisujemy historię.
      return this.scheduleSendRetryAfterRateLimit({
        workspaceId,
        orderId,
        correlationId,
        scenario,
        idempotencyKey,
        requestHash,
        rateLimit: simulatorResult
      });
    }

    if (!simulatorResult.accepted) {
      // Laboratorium nie przyjęło zlecenia. To poprawne zachowanie integracji,
      // a nie błąd techniczny: zlecenie zostaje w SAMPLE_COLLECTED, nie powstaje
      // klucz idempotencji, zadanie `lab_jobs` ani wpisy ORDER_SENT_TO_LAB
      // i LAB_ORDER_ACCEPTED. Dzięki temu 422 nie blokuje zlecenia na stałe —
      // po zmianie scenariusza ta sama wysyłka przechodzi normalnie.
      return this.rejectSendByLab({
        workspaceId,
        orderId,
        correlationId,
        previousStatus: order.status,
        rejection: simulatorResult
      });
    }

    let updatedOrder;
    try {
      updatedOrder = await this.prisma.$transaction(async (tx) => {
        await tx.idempotencyKey.create({
          data: {
            workspaceId,
            orderId,
            key: idempotencyKey,
            requestHash,
            responseStatus: HttpStatus.OK,
            responseBody: {
              externalOrderId: simulatorResult.externalOrderId,
              estimatedCompletionAt: simulatorResult.estimatedCompletionAt.toISOString()
            }
          }
        });

        for (const job of simulatorResult.jobs) {
          await tx.labJob.create({
            data: {
              workspaceId,
              orderId,
              scenario: job.scenario,
              payload: job.payload as unknown as Prisma.InputJsonValue,
              executeAt: job.executeAt
            }
          });
        }

        const sentAt = new Date();
        const updated = await tx.order.update({
          where: { id: orderId },
          data: {
            status: "SENT_TO_LAB",
            externalOrderId: simulatorResult.externalOrderId,
            correlationId,
            sentAt,
            estimatedCompletionAt: simulatorResult.estimatedCompletionAt
          },
          include: {
            tests: {
              include: {
                medicalTest: { select: { code: true, name: true, materialType: true } }
              },
              orderBy: {
                medicalTest: { code: "asc" }
              }
            },
            samples: {
              orderBy: {
                materialType: "asc"
              }
            }
          }
        });

        await this.orderHistory.record(tx, {
          workspaceId,
          orderId,
          eventType: "ORDER_SENT_TO_LAB",
          actorType: "STAFF",
          actorUserId,
          occurredAt: sentAt,
          correlationId,
          previousStatus: order.status,
          newStatus: "SENT_TO_LAB",
          details: buildOrderSentToLabDetails({
            idempotencyKey,
            correlationId,
            previousStatus: order.status,
            newStatus: "SENT_TO_LAB"
          })
        });

        await this.orderHistory.record(tx, {
          workspaceId,
          orderId,
          eventType: "LAB_ORDER_ACCEPTED",
          actorType: "LAB",
          occurredAt: sentAt,
          correlationId,
          // Aktywny scenariusz symulatora (`job.scenario`) zostaje wyłącznie
          // w technicznej kolejce `lab_jobs`. Historia zlecenia jest widoczna
          // dla uczestnika warsztatu, więc nie może go ujawniać.
          details: buildLabOrderAcceptedDetails({
            externalOrderId: simulatorResult.externalOrderId,
            estimatedCompletionAt: simulatorResult.estimatedCompletionAt.toISOString()
          })
        });

        return updated;
      });
    } catch (error) {
      if (!this.isPrismaUniqueConstraintError(error)) {
        throw error;
      }

      const concurrentKey = await this.prisma.idempotencyKey.findUnique({
        where: { workspaceId_key: { workspaceId, key: idempotencyKey } }
      });
      if (!concurrentKey) {
        throw error;
      }
      if (concurrentKey.requestHash !== requestHash) {
        throw new ApiErrorException(
          HttpStatus.CONFLICT,
          "IDEMPOTENCY_KEY_CONFLICT",
          "Zlecenie zostało już wysłane z innymi danymi."
        );
      }

      // Równoległe żądanie zarezerwowało klucz jako oczekujące ponowienie —
      // nie wolno zwrócić sukcesu dla wysyłki, która nie została przyjęta.
      if (concurrentKey.responseStatus === HttpStatus.TOO_MANY_REQUESTS) {
        throw await this.buildPendingRetryError(workspaceId, orderId);
      }

      const concurrentOrder = await this.prisma.order.findFirst({
        where: { id: orderId, workspaceId },
        include: {
          tests: {
            include: {
              medicalTest: { select: { code: true, name: true, materialType: true } }
            },
            orderBy: {
              medicalTest: { code: "asc" }
            }
          },
          samples: {
            orderBy: {
              materialType: "asc"
            }
          }
        }
      });
      if (!concurrentOrder) {
        throw error;
      }

      return toOrderResponse(concurrentOrder, concurrentOrder.tests, concurrentOrder.samples);
    }

    return toOrderResponse(updatedOrder, updatedOrder.tests, updatedOrder.samples);
  }

  /**
   * Zapisuje bezpieczny wpis historii `LAB_ORDER_REJECTED`, a dopiero potem
   * zgłasza błąd 422.
   *
   * Kolejność jest istotna: `throw` musi nastąpić PO zatwierdzeniu transakcji.
   * Rzucenie wyjątku wewnątrz `$transaction` wycofałoby zapis historii i
   * odrzucenie nie zostawiłoby żadnego śladu. Jeżeli sam zapis historii się nie
   * powiedzie, jego błąd propaguje się dalej i kończy się standardowym 500 —
   * nie udajemy poprawnego 422 bez śladu operacji.
   *
   * Każda próba wysyłki daje osobny wpis z własnym `correlationId`, więc kolejne
   * i równoległe próby są w historii rozróżnialne.
   */
  private async rejectSendByLab(input: {
    workspaceId: string;
    orderId: string;
    correlationId: string;
    previousStatus: OrderStatus;
    rejection: {
      errorCode: string;
      message: string;
      fieldErrors: Array<{ field: string; code: string; message: string }>;
    };
  }): Promise<never> {
    await this.prisma.$transaction(async (tx) => {
      await this.orderHistory.record(tx, {
        workspaceId: input.workspaceId,
        orderId: input.orderId,
        eventType: "LAB_ORDER_REJECTED",
        actorType: "LAB",
        correlationId: input.correlationId,
        // Odrzucenie nie zmienia statusu zlecenia — oba pola pozostają na
        // statusie sprzed próby wysyłki (SAMPLE_COLLECTED).
        previousStatus: input.previousStatus,
        newStatus: input.previousStatus,
        details: buildLabOrderRejectedDetails({
          fieldErrors: input.rejection.fieldErrors
        })
      });
    });

    throw new ApiErrorException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      input.rejection.errorCode,
      input.rejection.message,
      input.rejection.fieldErrors
    );
  }

  /**
   * Obsługuje pierwszą odpowiedź `429` laboratorium.
   *
   * Wszystko dzieje się w JEDNEJ transakcji: rezerwacja klucza idempotencji,
   * dokładnie jedno trwałe zadanie ponowienia i wpis historii o otrzymaniu
   * ograniczenia. Klucz idempotencji jest zarezerwowany celowo — w odróżnieniu
   * od `VALIDATION_ERROR` ta wysyłka będzie automatycznie ponawiana, a unikalność
   * klucza działa tu jako naturalny mutex dla żądań równoległych.
   *
   * Zlecenie NIE zmienia statusu (zostaje `SAMPLE_COLLECTED`), nie dostaje
   * `externalOrderId`, `sentAt`, `estimatedCompletionAt`, zadania callbacka ani
   * statusu `TECHNICAL_ERROR` — ograniczenie przepustowości jest przejściowe.
   */
  private async scheduleSendRetryAfterRateLimit(input: {
    workspaceId: string;
    orderId: string;
    correlationId: string;
    scenario: string;
    idempotencyKey: string;
    requestHash: string;
    rateLimit: LabSimulatorOrderRateLimited;
  }): Promise<never> {
    const { rateLimit } = input;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.idempotencyKey.create({
          data: {
            workspaceId: input.workspaceId,
            orderId: input.orderId,
            key: input.idempotencyKey,
            requestHash: input.requestHash,
            // Stan oczekującej operacji idempotentnej: wysyłka nie jest jeszcze
            // zakończona, więc kolejne żądanie nie może dostać sukcesu.
            responseStatus: HttpStatus.TOO_MANY_REQUESTS,
            responseBody: {
              state: PENDING_SEND_RETRY_STATE,
              attemptNumber: rateLimit.nextAttemptNumber,
              nextRetryAt: rateLimit.nextRetryAt.toISOString()
            }
          }
        });

        await tx.labSendRetryJob.create({
          data: {
            workspaceId: input.workspaceId,
            orderId: input.orderId,
            attemptNumber: rateLimit.nextAttemptNumber,
            executeAt: rateLimit.nextRetryAt,
            status: "PENDING",
            // Ten sam correlationId co pierwotna wysyłka — cała ścieżka
            // 429 → ponowienie → przyjęcie jest spięta jednym identyfikatorem.
            correlationId: input.correlationId,
            // Scenariusz utrwalony w chwili powstania zadania. Wykonanie NIE
            // czyta ponownie globalnej konfiguracji, więc jej późniejsza zmiana
            // nie zamieni tego zadania w inny scenariusz.
            scenario: input.scenario,
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash
          }
        });

        await this.orderHistory.record(tx, {
          workspaceId: input.workspaceId,
          orderId: input.orderId,
          eventType: "LAB_RATE_LIMIT_RECEIVED",
          // Odpowiedź 429 pochodzi od laboratorium, a nie od personelu.
          actorType: "LAB",
          correlationId: input.correlationId,
          previousStatus: "SAMPLE_COLLECTED",
          newStatus: "SAMPLE_COLLECTED",
          details: buildLabRateLimitReceivedDetails({
            attemptNumber: FIRST_LAB_SEND_ATTEMPT_NUMBER,
            retryAfterSeconds: rateLimit.retryAfterSeconds,
            nextRetryAt: rateLimit.nextRetryAt
          })
        });
      });
    } catch (error) {
      if (!this.isPrismaUniqueConstraintError(error)) {
        throw error;
      }

      // Równoległe pierwsze żądanie zdążyło zarezerwować klucz i utworzyć
      // zadanie. Nie tworzymy drugiego zadania ani drugiego wpisu historii —
      // zwracamy spójną odpowiedź o oczekiwaniu na automatyczne ponowienie.
      throw await this.buildPendingRetryError(input.workspaceId, input.orderId);
    }

    throw this.rateLimitError(rateLimit.retryAfterSeconds);
  }

  /**
   * Buduje odpowiedź `429` dla żądania trafiającego w trwające oczekiwanie na
   * automatyczne ponowienie.
   *
   * `Retry-After` wskazuje pozostały czas do zaplanowanego terminu, nigdy nie
   * jest ujemny, a brak zadania (np. już wykonanego) daje `0` — zlecenie czeka
   * wtedy wyłącznie na najbliższy przebieg schedulera.
   */
  private async buildPendingRetryError(
    workspaceId: string,
    orderId: string
  ): Promise<ApiErrorException> {
    const job = await this.prisma.labSendRetryJob.findFirst({
      where: { workspaceId, orderId, status: { in: ["PENDING", "PROCESSING"] } }
    });

    const retryAfterSeconds = job
      ? computeRetryAfterSeconds({ now: new Date(), executeAt: job.executeAt })
      : 0;

    return this.rateLimitError(retryAfterSeconds);
  }

  private rateLimitError(retryAfterSeconds: number): ApiErrorException {
    return new ApiErrorException(
      HttpStatus.TOO_MANY_REQUESTS,
      LAB_RATE_LIMITED_ERROR_CODE,
      LAB_RATE_LIMITED_MESSAGE,
      undefined,
      { "Retry-After": String(Math.max(0, Math.trunc(retryAfterSeconds))) }
    );
  }

  /**
   * Wykonuje zaplanowane, automatyczne ponowienie wysyłki zlecenia.
   *
   * Metoda jest wywoływana wyłącznie przez scheduler dla zadania już atomowo
   * przejętego (status `PROCESSING`). Cały skutek udanego ponowienia jest
   * zapisywany w JEDNEJ transakcji: zadanie ponowienia → `DONE`, klucz
   * idempotencji → sukces, zmiana statusu zlecenia, zadania callbacka i wpisy
   * historii. Błąd transakcji nie zostawia częściowo przyjętego zlecenia.
   */
  async executeSendRetry(jobId: string): Promise<void> {
    const job = await this.prisma.labSendRetryJob.findUnique({ where: { id: jobId } });
    if (!job) {
      return;
    }

    const order = await this.prisma.order.findFirst({
      where: { id: job.orderId, workspaceId: job.workspaceId },
      include: {
        tests: {
          include: {
            medicalTest: {
              select: {
                code: true,
                name: true,
                materialType: true,
                parameters: { select: { code: true, valueType: true, unit: true } }
              }
            }
          },
          orderBy: { medicalTest: { code: "asc" } }
        },
        samples: { orderBy: { materialType: "asc" } }
      }
    });

    if (!order) {
      throw new Error(`Ponowienie wysyłki: nie znaleziono zlecenia ${job.orderId}.`);
    }

    if (!canSendOrder(order.status)) {
      // Zlecenie zmieniło stan poza tym zadaniem (np. inna instancja zdążyła je
      // wysłać). Ponowienie nie może duplikować wysyłki.
      throw new Error(
        `Ponowienie wysyłki: zlecenie ${job.orderId} nie jest już gotowe do wysyłki.`
      );
    }

    const simulatorResult = this.labSimulator.acceptOrder({
      workspaceId: job.workspaceId,
      orderId: job.orderId,
      correlationId: job.correlationId,
      attemptNumber: job.attemptNumber,
      // Scenariusz pochodzi z danych zadania, a nie z bieżącej konfiguracji.
      scenario: resolveLabSimulatorScenario(job.scenario),
      tests: order.tests.map((test) => ({
        medicalTestId: test.medicalTestId,
        code: test.medicalTest.code,
        materialType: test.medicalTest.materialType,
        parameters: test.medicalTest.parameters
      })),
      samples: order.samples.map((sample) => ({
        sampleId: sample.id,
        materialType: sample.materialType
      }))
    });

    if (!simulatorResult.accepted) {
      // W zakresie tego etapu druga próba scenariusza RATE_LIMIT zawsze kończy
      // się przyjęciem. Kolejne odmowy (wyczerpanie prób, TECHNICAL_ERROR) są
      // zaplanowane na późniejsze PR-y, więc tutaj traktujemy je jako błąd
      // zadania — bez cichego pozostawienia zlecenia w niespójnym stanie.
      throw new Error(
        `Ponowienie wysyłki: laboratorium nie przyjęło zlecenia ${job.orderId}.`
      );
    }

    await this.commitAcceptedSendRetry({ job, previousStatus: order.status, simulatorResult });
  }

  private async commitAcceptedSendRetry(input: {
    job: {
      id: string;
      workspaceId: string;
      orderId: string;
      attemptNumber: number;
      correlationId: string;
      idempotencyKey: string;
    };
    previousStatus: OrderStatus;
    simulatorResult: LabSimulatorOrderAccepted;
  }): Promise<void> {
    const { job, simulatorResult } = input;

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.labSendRetryJob.updateMany({
        where: { id: job.id, status: "PROCESSING" },
        data: { status: "DONE", lockedAt: null, lastError: null }
      });
      if (claimed.count === 0) {
        // Zadanie przestało należeć do tego procesu — przerywamy bez skutków.
        throw new Error(
          `Ponowienie wysyłki: zadanie ${job.id} nie jest już w stanie PROCESSING.`
        );
      }

      await tx.idempotencyKey.update({
        where: {
          workspaceId_key: { workspaceId: job.workspaceId, key: job.idempotencyKey }
        },
        data: {
          responseStatus: HttpStatus.OK,
          responseBody: {
            externalOrderId: simulatorResult.externalOrderId,
            estimatedCompletionAt: simulatorResult.estimatedCompletionAt.toISOString()
          }
        }
      });

      for (const callbackJob of simulatorResult.jobs) {
        await tx.labJob.create({
          data: {
            workspaceId: job.workspaceId,
            orderId: job.orderId,
            scenario: callbackJob.scenario,
            payload: callbackJob.payload as unknown as Prisma.InputJsonValue,
            executeAt: callbackJob.executeAt
          }
        });
      }

      const sentAt = new Date();
      await tx.order.update({
        where: { id: job.orderId },
        data: {
          status: "SENT_TO_LAB",
          externalOrderId: simulatorResult.externalOrderId,
          correlationId: job.correlationId,
          sentAt,
          estimatedCompletionAt: simulatorResult.estimatedCompletionAt
        }
      });

      await this.orderHistory.record(tx, {
        workspaceId: job.workspaceId,
        orderId: job.orderId,
        eventType: "LAB_SEND_RETRY",
        // Automatyczne ponowienie jest działaniem systemu, a nie nowym
        // kliknięciem personelu.
        actorType: "SYSTEM",
        occurredAt: sentAt,
        correlationId: job.correlationId,
        previousStatus: "SAMPLE_COLLECTED",
        newStatus: "SENT_TO_LAB",
        details: buildLabSendRetryDetails({ attemptNumber: job.attemptNumber })
      });

      await this.orderHistory.record(tx, {
        workspaceId: job.workspaceId,
        orderId: job.orderId,
        eventType: "ORDER_SENT_TO_LAB",
        actorType: "SYSTEM",
        occurredAt: sentAt,
        correlationId: job.correlationId,
        previousStatus: "SAMPLE_COLLECTED",
        newStatus: "SENT_TO_LAB",
        details: buildOrderSentToLabDetails({
          idempotencyKey: job.idempotencyKey,
          correlationId: job.correlationId,
          previousStatus: "SAMPLE_COLLECTED",
          newStatus: "SENT_TO_LAB"
        })
      });

      await this.orderHistory.record(tx, {
        workspaceId: job.workspaceId,
        orderId: job.orderId,
        eventType: "LAB_ORDER_ACCEPTED",
        actorType: "LAB",
        occurredAt: sentAt,
        correlationId: job.correlationId,
        details: buildLabOrderAcceptedDetails({
          externalOrderId: simulatorResult.externalOrderId,
          estimatedCompletionAt: simulatorResult.estimatedCompletionAt.toISOString()
        })
      });
    });
  }

  private hashSendRequest(order: {
    patientId: string;
    tests: Array<{ medicalTestId: string }>;
    samples: Array<{ id: string; barcode: string | null }>;
  }): string {
    const payload = {
      patientId: order.patientId,
      testIds: order.tests.map((test) => test.medicalTestId).sort(),
      samples: order.samples
        .map((sample) => ({ id: sample.id, barcode: sample.barcode }))
        .sort((a, b) => a.id.localeCompare(b.id))
    };
    return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  }

  private orderSendError(errors: { field: string; code: string }[]) {
    return new ApiErrorException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "ORDER_SEND_ERROR",
      "Nie udało się wysłać zlecenia do laboratorium.",
      errors.map((error) => ({
        ...error,
        message: this.sendFieldErrorMessage(error.code)
      }))
    );
  }

  private sendFieldErrorMessage(code: string): string {
    const messages: Record<string, string> = {
      ORDER_NOT_SENDABLE:
        "Zlecenie można wysłać do laboratorium wyłącznie po zarejestrowaniu wszystkich próbek.",
      PATIENT_INACTIVE:
        "Nie można wysłać zlecenia dla nieaktywnego pacjenta."
    };
    return messages[code] ?? "Wysłanie zlecenia zawiera nieprawidłowe dane.";
  }

  private sampleRegistrationError(errors: { field: string; code: string }[]) {
    return new ApiErrorException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "SAMPLE_REGISTRATION_ERROR",
      "Nie udało się zarejestrować próbki.",
      errors.map((error) => ({
        ...error,
        message: this.sampleFieldErrorMessage(error.code)
      }))
    );
  }

  private mapSampleRegistrationConflict(error: unknown): never {
    if (error instanceof ApiErrorException) {
      throw error;
    }

    if (this.isPrismaUniqueConstraintError(error)) {
      const target = [
        String(error.meta?.target ?? ""),
        String(error.message ?? ""),
        String(error.sqlMessage ?? "")
      ]
        .join(" ")
        .toLowerCase();

      if (target.includes("barcode")) {
        throw this.sampleRegistrationError([{ field: "barcode", code: "DUPLICATE_BARCODE" }]);
      }
    }

    throw error;
  }

  private isPrismaUniqueConstraintError(
    error: unknown
  ): error is {
    code?: string;
    errno?: number;
    meta?: { target?: unknown };
    message?: string;
    sqlMessage?: string;
  } {
    return (
      typeof error === "object" &&
      error !== null &&
      (("code" in error && error.code === "P2002") ||
        ("code" in error && error.code === "ER_DUP_ENTRY") ||
        ("errno" in error && error.errno === 1062))
    );
  }

  private sampleFieldErrorMessage(code: string): string {
    const messages: Record<string, string> = {
      ORDER_NOT_EDITABLE:
        "Próbki można rejestrować wyłącznie dla zlecenia oczekującego na pobranie próbek.",
      MATERIAL_TYPE_NOT_REQUIRED:
        "Wskazany rodzaj materiału nie jest wymagany w tym zleceniu.",
      SAMPLE_ALREADY_COLLECTED:
        "Próbka tego rodzaju materiału została już zarejestrowana.",
      DUPLICATE_BARCODE: "Kod kreskowy jest już użyty w tej placówce.",
      COLLECTED_AT_IN_FUTURE: "Data pobrania nie może być w przyszłości.",
      COLLECTED_AT_BEFORE_ORDER:
        "Data pobrania nie może być wcześniejsza niż utworzenie zlecenia."
    };
    return messages[code] ?? "Rejestracja próbki zawiera nieprawidłowe dane.";
  }

  private validateListParams(params: OrdersListParams): OrdersListValidationError[] {
    const errors: OrdersListValidationError[] = [];

    if (params.page !== undefined && (params.page < 1 || !Number.isInteger(params.page))) {
      errors.push({ field: "page", code: "INVALID_PAGE" });
    }

    if (
      params.pageSize !== undefined &&
      (params.pageSize < 1 || params.pageSize > 100 || !Number.isInteger(params.pageSize))
    ) {
      errors.push({ field: "pageSize", code: "INVALID_PAGE_SIZE" });
    }

    if (
      params.status &&
      ![
        "DRAFT",
        "SAMPLE_COLLECTION_IN_PROGRESS",
        "SAMPLE_COLLECTED",
        "SENT_TO_LAB",
        "PROCESSING",
        "PARTIAL",
        "COMPLETED",
        "REJECTED",
        "TECHNICAL_ERROR"
      ].includes(params.status)
    ) {
      errors.push({ field: "status", code: "INVALID_STATUS" });
    }

    if (params.priority && !["ROUTINE", "URGENT"].includes(params.priority)) {
      errors.push({ field: "priority", code: "INVALID_PRIORITY" });
    }

    if (
      params.materialType &&
      !["EDTA_BLOOD", "SERUM", "URINE"].includes(params.materialType)
    ) {
      errors.push({ field: "materialType", code: "INVALID_MATERIAL_TYPE" });
    }

    if (
      params.sort &&
      ![
        "createdAt",
        "updatedAt",
        "status",
        "priority",
        "patientLastName"
      ].includes(params.sort)
    ) {
      errors.push({ field: "sort", code: "INVALID_SORT_FIELD" });
    }

    if (params.order && !["asc", "desc"].includes(params.order)) {
      errors.push({ field: "order", code: "INVALID_ORDER" });
    }

    // Validate dates
    let createdFromDate: Date | null = null;
    let createdToDate: Date | null = null;

    try {
      createdFromDate = parseDate(params.createdFrom, "createdFrom");
    } catch (error) {
      errors.push(error as OrdersListValidationError);
    }

    try {
      createdToDate = parseDate(params.createdTo, "createdTo");
    } catch (error) {
      errors.push(error as OrdersListValidationError);
    }

    // Only validate date range if both dates were parsed successfully
    if (createdFromDate && createdToDate) {
      const rangeErrors = validateDateRange(createdFromDate, createdToDate);
      errors.push(...rangeErrors);
    }

    return errors;
  }

  private buildWhereClause(
    workspaceId: string,
    params: OrdersListParams,
    normalizedSearchTerm: string | null
  ): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {
      workspaceId
    };

    if (params.status) {
      where.status = params.status;
    }

    if (params.priority) {
      where.priority = params.priority;
    }

    if (params.patientId) {
      where.patientId = params.patientId;
    }

    if (normalizedSearchTerm) {
      where.OR = [
        { id: { contains: normalizedSearchTerm } },
        { externalOrderId: { contains: normalizedSearchTerm } },
        { correlationId: { contains: normalizedSearchTerm } },
        { patient: { firstName: { contains: normalizedSearchTerm } } },
        { patient: { lastName: { contains: normalizedSearchTerm } } },
        { patient: { pesel: { contains: normalizedSearchTerm } } },
        { patient: { documentNumber: { contains: normalizedSearchTerm } } },
        {
          tests: {
            some: {
              medicalTest: {
                OR: [
                  { code: { contains: normalizedSearchTerm } },
                  { name: { contains: normalizedSearchTerm } }
                ]
              }
            }
          }
        }
      ];
    }

    if (params.materialType) {
      where.samples = {
        some: { materialType: params.materialType }
      };
    }

    // Handle date range
    let createdFromDate: Date | null = null;
    let createdToDate: Date | null = null;

    try {
      createdFromDate = parseDate(params.createdFrom, "createdFrom");
      createdToDate = parseDate(params.createdTo, "createdTo");
    } catch {
      // Validation errors are handled in validateListParams
      return where;
    }

    if (createdFromDate) {
      where.createdAt = { gte: createdFromDate };
    }

    if (createdToDate) {
      const nextDay = normalizeCreatedToDate(createdToDate);
      if (createdFromDate) {
        where.createdAt = { gte: createdFromDate, lt: nextDay };
      } else {
        where.createdAt = { lt: nextDay };
      }
    }

    return where;
  }

  private buildOrderBy(
    sortField: string,
    sortOrder: string
  ): Prisma.OrderOrderByWithRelationInput | Prisma.OrderOrderByWithRelationInput[] {
    const order = sortOrder === "asc" ? "asc" : "desc";

    switch (sortField) {
      case "createdAt":
        return [{ createdAt: order }, { id: "asc" }];
      case "updatedAt":
        return [{ updatedAt: order }, { id: "asc" }];
      case "status":
        return [{ status: order }, { id: "asc" }];
      case "priority":
        return [{ priority: order }, { id: "asc" }];
      case "patientLastName":
        // Sort by patient lastName, then firstName, then order id
        return [
          { patient: { lastName: order } },
          { patient: { firstName: order } },
          { id: "asc" }
        ];
      default:
        return [{ updatedAt: "desc" }, { id: "asc" }];
    }
  }

  private listParamErrorMessage(code: string): string {
    const messages: Record<string, string> = {
      INVALID_PAGE: "Numer strony musi być liczbą dodatnią.",
      INVALID_PAGE_SIZE: "Liczba elementów na stronie musi być od 1 do 100.",
      INVALID_STATUS: "Niepoprawna wartość statusu.",
      INVALID_PRIORITY: "Niepoprawna wartość priorytetu.",
      INVALID_MATERIAL_TYPE: "Niepoprawny rodzaj materiału.",
      INVALID_SORT_FIELD: "Niepoprawne pole sortowania.",
      INVALID_ORDER: "Kierunek sortowania musi być 'asc' lub 'desc'.",
      INVALID_DATE_FORMAT: "Data musi być w formacie YYYY-MM-DD.",
      INVALID_DATE_RANGE:
        "Data początkowa nie może być późniejsza niż data końcowa."
    };
    return messages[code] ?? "Żądanie zawiera nieprawidłowe dane.";
  }

  private async validateOrderInput(input: Pick<CreateOrderRequest, "tests">): Promise<
    | {
        valid: true;
        tests: NormalizedOrderTestSelection[];
        catalog: MedicalTestWithRequiredFields[];
      }
    | { valid: false; errors: OrderValidationFieldError[] }
  > {
    if (!input.tests.length) {
      return {
        valid: false,
        errors: [{ field: "tests", code: "TESTS_REQUIRED" }]
      };
    }

    const duplicateErrors = findDuplicateMedicalTestSelections(input.tests);
    if (duplicateErrors.length) {
      return { valid: false, errors: duplicateErrors };
    }

    const requestedIds = input.tests.map((test) => test.medicalTestId);
    const catalog = await this.prisma.medicalTest.findMany({
      where: { id: { in: requestedIds } },
      include: {
        requiredFields: {
          select: { code: true, valueType: true, required: true }
        }
      }
    });
    const catalogById = new Map(catalog.map((test) => [test.id, test]));

    const catalogErrors: OrderValidationFieldError[] = [];
    for (const [index, test] of input.tests.entries()) {
      const catalogItem = catalogById.get(test.medicalTestId);
      if (!catalogItem) {
        catalogErrors.push({
          field: `tests.${index}.medicalTestId`,
          code: "MEDICAL_TEST_NOT_FOUND"
        });
        continue;
      }
      if (!catalogItem.active) {
        catalogErrors.push({
          field: `tests.${index}.medicalTestId`,
          code: "MEDICAL_TEST_INACTIVE"
        });
      }
    }

    if (catalogErrors.length) {
      return { valid: false, errors: catalogErrors };
    }

    const domainCatalog = new Map<string, OrderMedicalTestDefinition>(
      catalog.map((test) => [
        test.id,
        {
          id: test.id,
          materialType: test.materialType,
          requiredFields: test.requiredFields
        }
      ])
    );
    const additionalDataValidation = validateOrderAdditionalData(
      input.tests,
      domainCatalog
    );

    if (!additionalDataValidation.valid) {
      return { valid: false, errors: additionalDataValidation.errors };
    }

    return {
      valid: true,
      tests: additionalDataValidation.value,
      catalog
    };
  }

  private orderValidationError(errors: OrderValidationFieldError[]) {
    return new ApiErrorException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "ORDER_VALIDATION_ERROR",
      "Nie udało się utworzyć zlecenia.",
      errors.map((error) => ({
        ...error,
        message: this.fieldErrorMessage(error.code)
      }))
    );
  }

  private fieldErrorMessage(code: string): string {
    const messages: Record<string, string> = {
      PATIENT_INACTIVE:
        "Nie można utworzyć zlecenia dla nieaktywnego pacjenta.",
      NO_CHANGES: "PATCH nie zawiera rzeczywistej zmiany zlecenia.",
      ORDER_NOT_EDITABLE:
        "Zlecenie można edytować wyłącznie w statusie wersji roboczej.",
      TESTS_REQUIRED: "Zlecenie musi zawierać co najmniej jedno badanie.",
      DUPLICATE_TEST: "To samo badanie nie może wystąpić w zleceniu więcej niż raz.",
      MEDICAL_TEST_NOT_FOUND: "Nie znaleziono aktywnego badania w katalogu.",
      MEDICAL_TEST_INACTIVE:
        "Nieaktywnego badania nie można dodać do nowego zlecenia.",
      REQUIRED_ADDITIONAL_DATA:
        "Wymagane dane dodatkowe dla badania nie zostały uzupełnione.",
      INVALID_ADDITIONAL_DATA_TYPE:
        "Dane dodatkowe mają nieprawidłowy typ albo pustą wartość.",
      UNKNOWN_ADDITIONAL_DATA_FIELD:
        "Dane dodatkowe zawierają pole niezdefiniowane dla tego badania."
    };
    return messages[code] ?? "Zlecenie zawiera nieprawidłowe dane.";
  }

  private orderUpdateError(errors: OrderValidationFieldError[]) {
    return new ApiErrorException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "ORDER_UPDATE_ERROR",
      "Nie udało się zaktualizować zlecenia.",
      errors.map((error) => ({
        ...error,
        message: this.updateFieldErrorMessage(error.code)
      }))
    );
  }

  private updateFieldErrorMessage(code: string): string {
    const messages: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries({
          PATIENT_INACTIVE:
            "Nie można przypisać zlecenia do nieaktywnego pacjenta.",
          NO_CHANGES: "PATCH nie zawiera rzeczywistej zmiany zlecenia.",
          ORDER_NOT_EDITABLE:
            "Zlecenie można edytować wyłącznie w statusie wersji roboczej.",
          TESTS_REQUIRED: "Zlecenie musi zawierać co najmniej jedno badanie.",
          DUPLICATE_TEST:
            "To samo badanie nie może wystąpić w zleceniu więcej niż raz.",
          MEDICAL_TEST_NOT_FOUND: "Nie znaleziono aktywnego badania w katalogu.",
          MEDICAL_TEST_INACTIVE:
            "Nieaktywnego badania nie można dodać do zlecenia.",
          REQUIRED_ADDITIONAL_DATA:
            "Wymagane dane dodatkowe dla badania nie zostały uzupełnione.",
          INVALID_ADDITIONAL_DATA_TYPE:
            "Dane dodatkowe mają nieprawidłowy typ albo pustą wartość.",
          UNKNOWN_ADDITIONAL_DATA_FIELD:
            "Dane dodatkowe zawierają pole niezdefiniowane dla tego badania."
        })
      )
    };
    return messages[code] ?? "Aktualizacja zlecenia zawiera nieprawidłowe dane.";
  }

  private hasPatchShape(input: UpdateOrderRequest) {
    return (
      input.patientId !== undefined ||
      input.priority !== undefined ||
      input.tests !== undefined
    );
  }

  private toDraftOrderState(order: {
    patientId: string;
    priority: "ROUTINE" | "URGENT";
    tests: Array<{
      medicalTestId: string;
      additionalData: Prisma.JsonValue | null;
    }>;
  }): DraftOrderState {
    return {
      patientId: order.patientId,
      priority: order.priority,
      tests: order.tests.map((test) => ({
        medicalTestId: test.medicalTestId,
        additionalData: test.additionalData as NormalizedOrderTestSelection["additionalData"]
      }))
    };
  }

  private toPrismaJson(
    value: NormalizedOrderTestSelection["additionalData"]
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
    return value ?? Prisma.JsonNull;
  }
}
