import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type MedicalTest, type Order, type OrderTest, type Sample } from "@prisma/client";
import {
  buildLabResultReceivedDetails,
  buildLabSampleRejectedDetails,
  canTransitionOrderStatus,
  determineOrderStatusAfterResults,
  type OrderStatus,
  type OrderTestCompletionStatus
} from "@klinika/domain";
import {
  LAB_REJECTION_CODE_MAX_LENGTH,
  LAB_REJECTION_REASON_MAX_LENGTH,
  type LabRejectedSamplePayload,
  type LabResultsWebhookRequest
} from "@klinika/api-contracts";
import { ApiErrorException } from "../common/errors/api-error.exception";
import { PrismaService } from "../common/prisma/prisma.service";
import { OrderHistoryService } from "../order-history/order-history.service";

type RejectionOrderContext = Order & {
  tests: Array<OrderTest & { medicalTest: Pick<MedicalTest, "code" | "materialType"> }>;
  samples: Sample[];
};

@Injectable()
export class LabCallbacksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderHistory: OrderHistoryService
  ) {}

  async processResults(payload: LabResultsWebhookRequest): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { externalOrderId: payload.externalOrderId },
      include: {
        tests: {
          include: { medicalTest: { select: { code: true, materialType: true } } }
        },
        samples: true
      }
    });

    if (!order) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        "ORDER_NOT_FOUND",
        "Nie znaleziono zlecenia dla podanego externalOrderId."
      );
    }

    const alreadyProcessed = await this.prisma.processedLabEvent.findUnique({
      where: {
        workspaceId_eventId: { workspaceId: order.workspaceId, eventId: payload.eventId }
      }
    });
    if (alreadyProcessed) {
      // Powtórne dostarczenie tego samego eventId nie może duplikować wyników.
      return;
    }

    if (payload.status === "REJECTED") {
      await this.processSampleRejection(order, payload);
      return;
    }

    if (payload.rejectedSamples && payload.rejectedSamples.length > 0) {
      throw this.rejectionValidationError(
        "rejectedSamples",
        "REJECTED_SAMPLES_NOT_ALLOWED",
        "Lista rejectedSamples jest dozwolona wyłącznie dla statusu REJECTED."
      );
    }

    // Zawężenie odczytane poza domknięciem transakcji: status REJECTED został
    // już obsłużony i zwrócony wyżej.
    const callbackStatus: "PARTIAL" | "COMPLETED" = payload.status;
    const completedMedicalTestIds = payload.results.map((result) => result.medicalTestId);
    const nextStatus = this.resolveNextOrderStatus(order.status, order.tests, completedMedicalTestIds);

    await this.prisma.$transaction(async (tx) => {
      const createdEvent = await tx.processedLabEvent.createMany({
        data: {
          workspaceId: order.workspaceId,
          orderId: order.id,
          eventId: payload.eventId
        },
        skipDuplicates: true
      });
      if (createdEvent.count === 0) {
        return;
      }

      const resultedAt = new Date();
      for (const testResult of payload.results) {
        for (const parameter of testResult.parameters) {
          await tx.result.upsert({
            where: {
              orderId_medicalTestId_parameterCode: {
                orderId: order.id,
                medicalTestId: testResult.medicalTestId,
                parameterCode: parameter.code
              }
            },
            create: {
              workspaceId: order.workspaceId,
              orderId: order.id,
              medicalTestId: testResult.medicalTestId,
              parameterCode: parameter.code,
              value: parameter.value,
              unit: parameter.unit,
              referenceRange: null,
              flag: parameter.flag,
              resultedAt
            },
            update: {
              value: parameter.value,
              unit: parameter.unit,
              flag: parameter.flag,
              resultedAt
            }
          });
        }
      }

      if (completedMedicalTestIds.length > 0) {
        await tx.orderTest.updateMany({
          where: { orderId: order.id, medicalTestId: { in: completedMedicalTestIds } },
          data: { status: "COMPLETED" }
        });
      }

      const dataToUpdate: Prisma.OrderUpdateInput = { status: nextStatus };
      if (nextStatus === "COMPLETED") {
        await tx.sample.updateMany({
          where: { orderId: order.id },
          data: { status: "ACCEPTED" }
        });
      }

      await tx.order.update({ where: { id: order.id }, data: dataToUpdate });

      const resultCount = payload.results.reduce(
        (sum, testResult) => sum + testResult.parameters.length,
        0
      );

      await this.orderHistory.record(tx, {
        workspaceId: order.workspaceId,
        orderId: order.id,
        eventType: "LAB_RESULT_RECEIVED",
        actorType: "LAB",
        occurredAt: resultedAt,
        correlationId: payload.correlationId ?? null,
        integrationEventId: payload.eventId,
        previousStatus: order.status,
        newStatus: nextStatus,
        details: buildLabResultReceivedDetails({
          eventId: payload.eventId,
          externalOrderId: payload.externalOrderId,
          callbackStatus,
          testCodes: order.tests
            .filter((test) => completedMedicalTestIds.includes(test.medicalTestId))
            .map((test) => test.medicalTest.code),
          resultCount,
          previousStatus: order.status,
          newStatus: nextStatus
        })
      });
    });
  }

  /**
   * Obsługa terminalnego callbacka REJECTED: laboratorium odrzuciło co najmniej
   * jedną próbkę zlecenia.
   *
   * Pełna walidacja payloadu i statusu zlecenia wykonuje się przed jakąkolwiek
   * zmianą danych, a wszystkie zapisy (idempotencja, wyniki, statusy badań,
   * statusy próbek, przyczyna odrzucenia, status zlecenia i wpis historii)
   * dzieją się w jednej transakcji. Błąd dowolnego kroku wycofuje całość.
   */
  private async processSampleRejection(
    order: RejectionOrderContext,
    payload: LabResultsWebhookRequest
  ): Promise<void> {
    const rejectedSamples = this.validateRejectedSamples(order, payload);
    const nextStatus = "REJECTED" as const;
    this.assertOrderStatusTransition(order.status, nextStatus);

    const { completedTests, rejectedTests, acceptedSampleIds } =
      this.validateRejectionConsistency(order, payload, rejectedSamples);

    const rejectedSamplesForHistory = rejectedSamples.map((rejection) => ({
      sampleId: rejection.sampleId,
      materialType: order.samples.find((sample) => sample.id === rejection.sampleId)!
        .materialType,
      rejectionCode: rejection.rejectionCode,
      rejectionReason: rejection.rejectionReason
    }));

    await this.prisma.$transaction(async (tx) => {
      const createdEvent = await tx.processedLabEvent.createMany({
        data: {
          workspaceId: order.workspaceId,
          orderId: order.id,
          eventId: payload.eventId
        },
        skipDuplicates: true
      });
      if (createdEvent.count === 0) {
        return;
      }

      const occurredAt = new Date();

      for (const testResult of payload.results) {
        for (const parameter of testResult.parameters) {
          await tx.result.upsert({
            where: {
              orderId_medicalTestId_parameterCode: {
                orderId: order.id,
                medicalTestId: testResult.medicalTestId,
                parameterCode: parameter.code
              }
            },
            create: {
              workspaceId: order.workspaceId,
              orderId: order.id,
              medicalTestId: testResult.medicalTestId,
              parameterCode: parameter.code,
              value: parameter.value,
              unit: parameter.unit,
              referenceRange: null,
              flag: parameter.flag,
              resultedAt: occurredAt
            },
            update: {
              value: parameter.value,
              unit: parameter.unit,
              flag: parameter.flag,
              resultedAt: occurredAt
            }
          });
        }
      }

      if (completedTests.length > 0) {
        await tx.orderTest.updateMany({
          where: { orderId: order.id, id: { in: completedTests.map((test) => test.id) } },
          data: { status: "COMPLETED" }
        });
      }

      if (rejectedTests.length > 0) {
        await tx.orderTest.updateMany({
          where: { orderId: order.id, id: { in: rejectedTests.map((test) => test.id) } },
          data: { status: "REJECTED" }
        });
      }

      for (const rejection of rejectedSamples) {
        // Zakres `orderId` gwarantuje, że callback nie zmieni próbki innego
        // zlecenia ani innego workspace'u, nawet gdyby podano obcy identyfikator.
        await tx.sample.updateMany({
          where: {
            id: rejection.sampleId,
            orderId: order.id,
            workspaceId: order.workspaceId
          },
          data: {
            status: "REJECTED",
            rejectionCode: rejection.rejectionCode,
            rejectionReason: rejection.rejectionReason
          }
        });
      }

      if (acceptedSampleIds.length > 0) {
        await tx.sample.updateMany({
          where: { orderId: order.id, id: { in: acceptedSampleIds } },
          data: { status: "ACCEPTED" }
        });
      }

      await tx.order.update({
        where: { id: order.id },
        data: { status: nextStatus }
      });

      await this.orderHistory.record(tx, {
        workspaceId: order.workspaceId,
        orderId: order.id,
        eventType: "LAB_SAMPLE_REJECTED",
        actorType: "LAB",
        occurredAt,
        correlationId: payload.correlationId ?? null,
        integrationEventId: payload.eventId,
        previousStatus: order.status,
        newStatus: nextStatus,
        // Jeden callback daje jeden wpis historii z kompletem odrzuconych
        // próbek — ograniczenie unikalności (workspaceId, integrationEventId,
        // eventType) pozostaje bez zmian.
        details: buildLabSampleRejectedDetails({
          eventId: payload.eventId,
          externalOrderId: payload.externalOrderId,
          rejectedSamples: rejectedSamplesForHistory,
          completedTestCodes: completedTests.map((test) => test.medicalTest.code),
          rejectedTestCodes: rejectedTests.map((test) => test.medicalTest.code),
          previousStatus: order.status,
          newStatus: nextStatus
        })
      });
    });
  }

  /**
   * Waliduje listę odrzuconych próbek zanim cokolwiek zostanie zapisane.
   *
   * Walidacja jest powtórzona tutaj, a nie tylko w DTO, ponieważ scheduler
   * kolejki `lab_jobs` wywołuje ten serwis bezpośrednio payloadem z bazy,
   * z pominięciem globalnego `ValidationPipe`.
   */
  private validateRejectedSamples(
    order: RejectionOrderContext,
    payload: LabResultsWebhookRequest
  ): LabRejectedSamplePayload[] {
    const rejectedSamples = payload.rejectedSamples ?? [];

    if (rejectedSamples.length === 0) {
      throw this.rejectionValidationError(
        "rejectedSamples",
        "REJECTED_SAMPLES_REQUIRED",
        "Dla statusu REJECTED lista rejectedSamples musi być niepusta."
      );
    }

    if (payload.pendingMedicalTestIds.length > 0) {
      throw this.rejectionValidationError(
        "pendingMedicalTestIds",
        "PENDING_TESTS_NOT_ALLOWED",
        "Terminalny callback REJECTED nie może pozostawiać badań oczekujących."
      );
    }

    const sampleIdsInOrder = new Set(order.samples.map((sample) => sample.id));
    const seen = new Set<string>();

    for (const rejection of rejectedSamples) {
      if (!rejection.rejectionCode?.trim()) {
        throw this.rejectionValidationError(
          "rejectedSamples.rejectionCode",
          "REJECTION_CODE_REQUIRED",
          "Kod przyczyny odrzucenia nie może być pusty."
        );
      }
      if (!rejection.rejectionReason?.trim()) {
        throw this.rejectionValidationError(
          "rejectedSamples.rejectionReason",
          "REJECTION_REASON_REQUIRED",
          "Opis przyczyny odrzucenia nie może być pusty."
        );
      }
      if (
        rejection.rejectionCode.length > LAB_REJECTION_CODE_MAX_LENGTH ||
        rejection.rejectionReason.length > LAB_REJECTION_REASON_MAX_LENGTH
      ) {
        throw this.rejectionValidationError(
          "rejectedSamples",
          "REJECTION_REASON_TOO_LONG",
          "Kod albo opis przyczyny odrzucenia przekracza dopuszczalną długość."
        );
      }
      if (seen.has(rejection.sampleId)) {
        throw this.rejectionValidationError(
          "rejectedSamples.sampleId",
          "DUPLICATE_REJECTED_SAMPLE",
          "Ta sama próbka nie może zostać wskazana wielokrotnie."
        );
      }
      seen.add(rejection.sampleId);

      if (!sampleIdsInOrder.has(rejection.sampleId)) {
        // Nieznana próbka albo próbka z innego zlecenia bądź workspace'u.
        // Odpowiedź jest identyczna w obu przypadkach, żeby nie ujawniać
        // istnienia zasobów spoza zlecenia wskazanego przez externalOrderId.
        throw this.rejectionValidationError(
          "rejectedSamples.sampleId",
          "SAMPLE_NOT_IN_ORDER",
          "Wskazana próbka nie należy do zlecenia o podanym externalOrderId."
        );
      }
    }

    return rejectedSamples;
  }

  /**
   * Sprawdza spójność terminalnego callbacka `REJECTED` przed jakąkolwiek
   * zmianą w bazie.
   *
   * Sam brak wyniku nie może wystarczyć do oznaczenia badania jako `REJECTED` —
   * inaczej callback odrzucający jedną próbkę mógłby pośrednio unieważnić
   * badania korzystające z zupełnie innego, nieodrzuconego materiału. Powiązanie
   * badanie → materiał → próbka jest jednoznaczne, ponieważ zlecenie ma co
   * najwyżej jedną próbkę danego materiału.
   *
   * Zwraca gotową klasyfikację używaną potem w transakcji, żeby reguła oceny i
   * reguła zapisu nie mogły się rozjechać.
   */
  private validateRejectionConsistency(
    order: RejectionOrderContext,
    payload: LabResultsWebhookRequest,
    rejectedSamples: LabRejectedSamplePayload[]
  ): {
    completedTests: RejectionOrderContext["tests"];
    rejectedTests: RejectionOrderContext["tests"];
    acceptedSampleIds: string[];
  } {
    const rejectedSampleIds = new Set(rejectedSamples.map((sample) => sample.sampleId));
    const rejectedMaterialTypes = new Set(
      order.samples
        .filter((sample) => rejectedSampleIds.has(sample.id))
        .map((sample) => sample.materialType)
    );

    const testsByMedicalTestId = new Map(
      order.tests.map((test) => [test.medicalTestId, test])
    );
    const resultMedicalTestIds = new Set<string>();

    for (const result of payload.results) {
      const test = testsByMedicalTestId.get(result.medicalTestId);
      if (!test) {
        throw this.rejectionValidationError(
          "results.medicalTestId",
          "MEDICAL_TEST_NOT_IN_ORDER",
          "Wynik dotyczy badania, które nie należy do zlecenia o podanym externalOrderId."
        );
      }
      if (resultMedicalTestIds.has(result.medicalTestId)) {
        throw this.rejectionValidationError(
          "results.medicalTestId",
          "DUPLICATE_MEDICAL_TEST_RESULT",
          "To samo badanie nie może wystąpić na liście wyników wielokrotnie."
        );
      }
      if (rejectedMaterialTypes.has(test.medicalTest.materialType)) {
        throw this.rejectionValidationError(
          "results.medicalTestId",
          "RESULT_FOR_REJECTED_MATERIAL",
          "Callback nie może przekazać wyniku badania wykonanego z odrzuconego materiału."
        );
      }
      resultMedicalTestIds.add(result.medicalTestId);
    }

    const completedTests: RejectionOrderContext["tests"] = [];
    const rejectedTests: RejectionOrderContext["tests"] = [];

    for (const test of order.tests) {
      const isCompleted =
        test.status === "COMPLETED" || resultMedicalTestIds.has(test.medicalTestId);
      if (isCompleted) {
        completedTests.push(test);
        continue;
      }
      if (rejectedMaterialTypes.has(test.medicalTest.materialType)) {
        rejectedTests.push(test);
        continue;
      }
      // Badanie nie jest zakończone, nie ma wyniku w tym callbacku i korzysta z
      // materiału, którego laboratorium nie odrzuciło. Terminalny callback nie
      // może go ani zostawić w PENDING, ani pośrednio odrzucić.
      throw this.rejectionValidationError(
        "results",
        "MISSING_RESULT_FOR_ACCEPTED_MATERIAL",
        "Terminalny callback REJECTED musi przekazać wynik każdego badania, którego materiał nie został odrzucony."
      );
    }

    const completedMedicalTestIds = new Set(
      completedTests.map((test) => test.medicalTestId)
    );
    // Nieodrzucona próbka zostaje ACCEPTED tylko wtedy, gdy ma powiązane
    // badania i wszystkie są zakończone.
    const acceptedSampleIds = order.samples
      .filter((sample) => {
        if (rejectedSampleIds.has(sample.id)) {
          return false;
        }
        const testsForSample = order.tests.filter(
          (test) => test.medicalTest.materialType === sample.materialType
        );
        return (
          testsForSample.length > 0 &&
          testsForSample.every((test) => completedMedicalTestIds.has(test.medicalTestId))
        );
      })
      .map((sample) => sample.id);

    return { completedTests, rejectedTests, acceptedSampleIds };
  }

  private rejectionValidationError(
    field: string,
    code: string,
    message: string
  ): ApiErrorException {
    return new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      "LAB_CALLBACK_VALIDATION_ERROR",
      message,
      [{ field, code, message }]
    );
  }

  private resolveNextOrderStatus(
    currentStatus: OrderStatus,
    tests: Array<{ medicalTestId: string; status: OrderTestCompletionStatus }>,
    completedMedicalTestIds: string[]
  ): "PARTIAL" | "COMPLETED" {
    const completedSet = new Set(completedMedicalTestIds);
    const projectedStatuses = tests.map((test) =>
      completedSet.has(test.medicalTestId) ? "COMPLETED" : test.status
    );
    const nextStatus = determineOrderStatusAfterResults(projectedStatuses);

    this.assertOrderStatusTransition(currentStatus, nextStatus);

    return nextStatus;
  }

  /**
   * Zlecenie w statusie SENT_TO_LAB przechodzi do statusu wynikowego logicznie
   * przez PROCESSING. Statusy terminalne COMPLETED i REJECTED nie przyjmują już
   * żadnego callbacka.
   */
  private assertOrderStatusTransition(
    currentStatus: OrderStatus,
    nextStatus: OrderStatus
  ): void {
    const effectiveCurrentStatus =
      currentStatus === "SENT_TO_LAB" ? "PROCESSING" : currentStatus;
    const transitionAllowed =
      currentStatus === effectiveCurrentStatus
        ? canTransitionOrderStatus(currentStatus, nextStatus)
        : canTransitionOrderStatus(currentStatus, effectiveCurrentStatus) &&
          canTransitionOrderStatus(effectiveCurrentStatus, nextStatus);

    if (!transitionAllowed) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        "ORDER_NOT_ACCEPTING_RESULTS",
        "Zlecenie nie przyjmuje już wyników w bieżącym statusie."
      );
    }
  }
}
