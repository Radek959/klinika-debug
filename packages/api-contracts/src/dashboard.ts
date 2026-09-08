import type { OrderStatus } from "./tests-catalog";

export interface DashboardPatientsSummary {
  total: number;
  active: number;
  inactive: number;
}

export type DashboardOrdersByStatus = Record<OrderStatus, number>;

export interface DashboardOrdersSummary {
  total: number;
  byStatus: DashboardOrdersByStatus;
}

export interface DashboardSummaryResponse {
  patients: DashboardPatientsSummary;
  orders: DashboardOrdersSummary;
}
