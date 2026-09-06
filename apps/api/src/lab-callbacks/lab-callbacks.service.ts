import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  canTransitionOrderStatus,
  determineOrderStatusAfterResults,
  type OrderStatus,
  type OrderTestCompletionStatus
} from "@klinika/domain";
import type { LabResultsWebhookRequest } from "@klinika/api-contracts";
import { ApiErrorException } from "../common/errors/api-error.exception";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class LabCallbacksService {
  constructor(private readonly prisma: PrismaService) {}

  async processResults(payload: LabResultsWebhookRequest): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { externalOrderId: payload.externalOrderId },
      include: { tests: true }
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
    });
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

    return nextStatus;
  }
}
