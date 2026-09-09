import { HttpStatus } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { ApiErrorException } from "../common/errors/api-error.exception";
import type { PrismaService } from "../common/prisma/prisma.service";
import { AdminController } from "./admin.controller";
import { AdminResetDto } from "./dto/admin-reset.dto";

/**
 * Testy jednostkowe wyłącznie dla `resetParticipant` — sprawdzają, że tylko
 * nieistniejący (ale poprawny) workspace daje 404, a każdy inny błąd (tu:
 * błąd transakcji/DB) propaguje niezmieniony, a nie jest maskowany jako 404.
 * Pozostałe zależności kontrolera nie są używane przez tę metodę, więc nie
 * wymagają pełnego `TestingModule`.
 */
describe("AdminController.resetParticipant", () => {
  function buildController(prisma: Partial<PrismaClient>): AdminController {
    return new AdminController(
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      prisma as PrismaService
    );
  }

  it("zwraca 400 dla nieprawidłowego sluga, bez wywołania Prisma", async () => {
    const findUnique = jest.fn();
    const controller = buildController({
      workspace: { findUnique }
    } as unknown as PrismaClient);

    await expect(
      controller.resetParticipant("klinika-pokazowa", { confirm: true } as AdminResetDto)
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("mapuje WorkshopWorkspaceNotFoundError na 404", async () => {
    const controller = buildController({
      workspace: { findUnique: jest.fn().mockResolvedValue(null) }
    } as unknown as PrismaClient);

    await expect(
      controller.resetParticipant("warsztat-07", { confirm: true } as AdminResetDto)
    ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });

  it("propaguje błąd DB/transakcji niezmieniony — NIE zwraca 404", async () => {
    const dbFailure = new Error("Connection lost");
    const controller = buildController({
      workspace: { findUnique: jest.fn().mockResolvedValue({ id: "w1", slug: "warsztat-07" }) },
      $transaction: jest.fn().mockRejectedValue(dbFailure)
    } as unknown as PrismaClient);

    await expect(
      controller.resetParticipant("warsztat-07", { confirm: true } as AdminResetDto)
    ).rejects.toBe(dbFailure);
  });

  it("(sanity) ApiErrorException dla nieprawidłowego sluga niesie kod ADMIN_INVALID_WORKSPACE_SLUG", async () => {
    const controller = buildController({
      workspace: { findUnique: jest.fn() }
    } as unknown as PrismaClient);

    try {
      await controller.resetParticipant("klinika-pokazowa", { confirm: true } as AdminResetDto);
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiErrorException);
      expect((error as ApiErrorException).getResponse()).toMatchObject({
        code: "ADMIN_INVALID_WORKSPACE_SLUG"
      });
    }
  });
});
