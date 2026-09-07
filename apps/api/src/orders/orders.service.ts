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
import { LabSimulatorService } from "../lab-simulator/lab-simulator.service";
import {
  OrderHistoryService,
  type OrderHistoryListParams
} from "../order-history/order-history.service";
import { toOrderResponse, toOrderListResponse, toOrderDetailsResponse } from "./orders.mapper";

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

    const simulatorResult = this.labSimulator.acceptOrder({
      workspaceId,
      orderId,
      correlationId,
      tests: order.tests.map((test) => ({
        medicalTestId: test.medicalTestId,
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
