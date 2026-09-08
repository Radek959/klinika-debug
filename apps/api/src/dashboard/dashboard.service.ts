import { Injectable } from "@nestjs/common";
import type { DashboardSummaryResponse, OrderStatus } from "@klinika/api-contracts";
import { PrismaService } from "../common/prisma/prisma.service";

const ORDER_STATUSES: readonly OrderStatus[] = [
  "DRAFT",
  "SAMPLE_COLLECTION_IN_PROGRESS",
  "SAMPLE_COLLECTED",
  "SENT_TO_LAB",
  "PROCESSING",
  "PARTIAL",
  "COMPLETED",
  "REJECTED",
  "TECHNICAL_ERROR"
];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(workspaceId: string): Promise<DashboardSummaryResponse> {
    const [totalPatients, activePatients, orderStatusGroups] = await Promise.all([
      this.prisma.patient.count({ where: { workspaceId } }),
      this.prisma.patient.count({ where: { workspaceId, active: true } }),
      this.prisma.order.groupBy({
        by: ["status"],
        where: { workspaceId },
        orderBy: { status: "asc" },
        _count: true
      })
    ]);

    const byStatus = ORDER_STATUSES.reduce(
      (acc, status) => {
        acc[status] = 0;
        return acc;
      },
      {} as Record<OrderStatus, number>
    );

    let totalOrders = 0;
    for (const group of orderStatusGroups) {
      byStatus[group.status] = group._count;
      totalOrders += group._count;
    }

    return {
      patients: {
        total: totalPatients,
        active: activePatients,
        inactive: totalPatients - activePatients
      },
      orders: {
        total: totalOrders,
        byStatus
      }
    };
  }
}
