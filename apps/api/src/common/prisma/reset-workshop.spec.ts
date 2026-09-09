import type { PrismaClient } from "@prisma/client";
import { resetSingleWorkshopWorkspace, WorkshopWorkspaceNotFoundError } from "./reset-workshop";

/**
 * Testy jednostkowe wyłącznie dla rozróżnienia "workspace nie istnieje" od
 * "coś innego się wysypało" w `resetSingleWorkshopWorkspace` — bez realnej
 * bazy i bez mockowania całego Prisma: fake client implementuje tylko
 * metody, które ta funkcja faktycznie wywołuje.
 */
describe("resetSingleWorkshopWorkspace — mapowanie błędów", () => {
  it("rzuca WorkshopWorkspaceNotFoundError, gdy poprawny slug warsztat-NN nie istnieje w bazie", async () => {
    const fakeClient = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue(null)
      }
    } as unknown as PrismaClient;

    await expect(
      resetSingleWorkshopWorkspace(fakeClient, { confirm: true, workspaceSlug: "warsztat-07" })
    ).rejects.toBeInstanceOf(WorkshopWorkspaceNotFoundError);
  });

  it("propaguje błąd transakcji/DB niezmieniony — NIE zamienia go w WorkshopWorkspaceNotFoundError", async () => {
    const dbFailure = new Error("Connection lost");
    const fakeClient = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ id: "workspace-1", slug: "warsztat-07" })
      },
      $transaction: jest.fn().mockRejectedValue(dbFailure)
    } as unknown as PrismaClient;

    await expect(
      resetSingleWorkshopWorkspace(fakeClient, { confirm: true, workspaceSlug: "warsztat-07" })
    ).rejects.toBe(dbFailure);
  });
});
