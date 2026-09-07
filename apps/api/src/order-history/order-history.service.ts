import { HttpStatus, Injectable } from "@nestjs/common";
import {
  Prisma,
  type OrderHistoryActorType,
  type OrderHistoryEventType,
  type OrderStatus
} from "@prisma/client";
import type { OrderHistoryListResponse } from "@klinika/api-contracts";
import { ApiErrorException } from "../common/errors/api-error.exception";
import { PrismaService } from "../common/prisma/prisma.service";
import { toOrderHistoryListResponse } from "./order-history.mapper";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

export interface RecordOrderHistoryInput {
  workspaceId: string;
  orderId: string;
  eventType: OrderHistoryEventType;
  actorType: OrderHistoryActorType;
  actorUserId?: string | null;
  occurredAt?: Date;
  correlationId?: string | null;
  integrationEventId?: string | null;
  previousStatus?: OrderStatus | null;
  newStatus?: OrderStatus | null;
  details: object;
}

export interface OrderHistoryListParams {
  page?: number;
  pageSize?: number;
}

@Injectable()
export class OrderHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Zapisuje zdarzenie historii wewnątrz istniejącej transakcji operacji biznesowej.
   * Jeżeli ten zapis rzuci wyjątek, cała otaczająca transakcja Prisma zostaje wycofana
   * razem z operacją biznesową — nie ma osobnego zapisu historii "po fakcie".
   */
  async record(
    tx: Prisma.TransactionClient,
    input: RecordOrderHistoryInput
  ): Promise<void> {
    const actorUserId = input.actorUserId ?? null;

    if (input.actorType === "STAFF" && !actorUserId) {
      throw new Error("OrderHistory: actorUserId jest wymagane dla actorType=STAFF.");
    }
    if (input.actorType !== "STAFF" && actorUserId) {
      throw new Error("OrderHistory: actorUserId musi być puste dla actorType!=STAFF.");
    }

    await tx.orderHistory.create({
      data: {
        workspaceId: input.workspaceId,
        orderId: input.orderId,
        eventType: input.eventType,
        actorType: input.actorType,
        actorUserId,
        occurredAt: input.occurredAt ?? new Date(),
        correlationId: input.correlationId ?? null,
        integrationEventId: input.integrationEventId ?? null,
        previousStatus: input.previousStatus ?? null,
        newStatus: input.newStatus ?? null,
        details: input.details as Prisma.InputJsonValue
      }
    });
  }

  async list(
    workspaceId: string,
    orderId: string,
    params: OrderHistoryListParams
  ): Promise<OrderHistoryListResponse> {
    if (params.page !== undefined && (!Number.isInteger(params.page) || params.page < 1)) {
      throw this.validationError("page", "INVALID_PAGE");
    }
    if (
      params.pageSize !== undefined &&
      (!Number.isInteger(params.pageSize) ||
        params.pageSize < 1 ||
        params.pageSize > MAX_PAGE_SIZE)
    ) {
      throw this.validationError("pageSize", "INVALID_PAGE_SIZE");
    }

    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const [rows, total] = await Promise.all([
      this.prisma.orderHistory.findMany({
        where: { workspaceId, orderId },
        include: { actorUser: { select: { displayName: true } } },
        orderBy: [{ occurredAt: "desc" }, { sequence: "desc" }],
        skip,
        take: pageSize
      }),
      this.prisma.orderHistory.count({ where: { workspaceId, orderId } })
    ]);

    return toOrderHistoryListResponse(rows, page, pageSize, total);
  }

  private validationError(field: string, code: string) {
    const messages: Record<string, string> = {
      INVALID_PAGE: "Numer strony musi być liczbą dodatnią.",
      INVALID_PAGE_SIZE: `Liczba elementów na stronie musi być od 1 do ${MAX_PAGE_SIZE}.`
    };
    return new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      "VALIDATION_ERROR",
      "Żądanie zawiera nieprawidłowe dane.",
      [{ field, code, message: messages[code] ?? "Nieprawidłowa wartość." }]
    );
  }
}
