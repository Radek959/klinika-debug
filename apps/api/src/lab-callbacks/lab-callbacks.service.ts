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
    const nextStatus: OrderStatus = "REJECTED";
    this.assertOrderStatusTransition(order.status, nextStatus);

    const rejectedSampleIds = new Set(rejectedSamples.map((sample) => sample.sampleId));

    // Badania z wynikami (w tym callbacku albo wcześniej) są wykonane; wszystkie
    // pozostałe są odrzucone razem z materiałem. Dzięki temu terminalne zlecenie
    // REJECTED nie zostawia żadnego badania w statusie PENDING.
    const resultMedicalTestIds = new Set(
      payload.results.map((result) => result.medicalTestId)
    );
    const completedTests = order.tests.filter(
      (test) => resultMedicalTestIds.has(test.medicalTestId) || test.status === "COMPLETED"
    );
    const rejectedTests = order.tests.filter(
      (test) => !completedTests.some((completed) => completed.id === test.id)
    );

    const completedMaterialTypes = new Set(
      completedTests.map((test) => test.medicalTest.materialType)
    );
    const acceptedSampleIds = order.samples
      .filter(
        (sample) =>
          !rejectedSampleIds.has(sample.id) &&
          completedMaterialTypes.has(sample.materialType)
      )
      .map((sample) => sample.id);

    // Kontrakt dopuszcza listę odrzuconych próbek, a symulator wysyła dokładnie
    // jedną. Ograniczenie unikalności historii (workspaceId, integrationEventId,
    // eventType) pozwala na jeden wpis na zdarzenie, więc oś czasu opisuje
    // deterministycznie wybraną pierwszą odrzuconą próbkę.
    const primaryRejection = [...rejectedSamples].sort((left, right) =>
      left.sampleId.localeCompare(right.sampleId)
    )[0];
    const primarySample = order.samples.find(
      (sample) => sample.id === primaryRejection.sampleId
    )!;

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
        details: buildLabSampleRejectedDetails({
          eventId: payload.eventId,
          externalOrderId: payload.externalOrderId,
          materialType: primarySample.materialType,
          sampleId: primaryRejection.sampleId,
          rejectionCode: primaryRejection.rejectionCode,
          rejectionReason: primaryRejection.rejectionReason,
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
