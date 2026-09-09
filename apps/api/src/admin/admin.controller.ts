import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
  UseGuards
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiExcludeController } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";
import { ApiErrorException } from "../common/errors/api-error.exception";
import { listWorkshopWorkspaces } from "../common/prisma/list-workshop-workspaces";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  resetSingleWorkshopWorkspace,
  resetWorkshopWorkspaces,
  WorkshopWorkspaceNotFoundError
} from "../common/prisma/reset-workshop";
import { isWorkshopWorkspaceSlug } from "../common/prisma/workshop-workspaces";
import { PasswordService } from "../auth/password.service";
import { LAB_SIMULATOR_SCENARIOS } from "../lab-simulator/lab-simulator-scenario";
import { CONTROLLED_BUGS } from "../workshop-config/controlled-bug";
import { LAB_DELAY_PRESETS_MS } from "../workshop-config/lab-delay";
import {
  WorkshopConfigService,
  type WorkshopConfigState
} from "../workshop-config/workshop-config.service";
import { AdminAuthGuard } from "./admin-auth.guard";
import { AdminSessionService } from "./admin-session.service";
import { buildSetCookie } from "./cookie.util";
import { AdminConfigUpdateDto } from "./dto/admin-config.dto";
import { AdminLoginDto } from "./dto/admin-login.dto";
import { AdminResetDto } from "./dto/admin-reset.dto";

/**
 * API panelu prowadzącego. Celowo POZA `/api/v1` (wykluczone w
 * `app.setGlobalPrefix`, patrz `app.module.ts`) i POZA publicznym OpenAPI
 * (`@ApiExcludeController`) — to techniczne narzędzie prowadzącego, a nie
 * część API produktu ani uprawnień `STAFF` (AGENTS.md, docs/ai/backend-playbook.md).
 */
@ApiExcludeController()
@Controller("admin/api")
export class AdminController {
  constructor(
    private readonly adminSession: AdminSessionService,
    private readonly passwordService: PasswordService,
    private readonly configService: ConfigService,
    private readonly workshopConfig: WorkshopConfigService,
    private readonly prisma: PrismaService
  ) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: AdminLoginDto,
    @Res({ passthrough: true }) reply: FastifyReply
  ): Promise<{ ok: true }> {
    const passwordHash = this.configService.getOrThrow<string>("ADMIN_PASSWORD_HASH");
    const passwordMatches = await this.verifyAdminPassword(passwordHash, dto.password);

    if (!passwordMatches) {
      // Celowo bez informacji, czy problemem jest hasło czy konfiguracja
      // serwera — publiczna odpowiedź nigdy nie ujawnia szczegółów panelu
      // prowadzącego. Hasło NIGDY nie trafia do logu.
      throw new ApiErrorException(
        HttpStatus.UNAUTHORIZED,
        "ADMIN_INVALID_CREDENTIALS",
        "Nieprawidłowe hasło."
      );
    }

    const token = this.adminSession.createToken();
    this.setSessionCookie(reply, token);
    return { ok: true };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminAuthGuard)
  logout(@Res({ passthrough: true }) reply: FastifyReply): void {
    this.clearSessionCookie(reply);
  }

  @Get("config")
  @UseGuards(AdminAuthGuard)
  async getConfig() {
    const config = await this.workshopConfig.getConfig();
    return this.toConfigResponse(config);
  }

  @Put("config")
  @UseGuards(AdminAuthGuard)
  async updateConfig(@Body() dto: AdminConfigUpdateDto) {
    const config = await this.workshopConfig.setConfig({
      labScenario: dto.labScenario as WorkshopConfigState["labScenario"],
      controlledBug: dto.controlledBug as WorkshopConfigState["controlledBug"],
      labDelayMs: dto.labDelayMs
    });
    return this.toConfigResponse(config);
  }

  @Post("reset")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminAuthGuard)
  async reset(@Body() dto: AdminResetDto) {
    // `resetWorkshopWorkspaces` jest jedynym, współdzielonym źródłem logiki
    // globalnego resetu (workspace'y + sesje + globalna konfiguracja) — to
    // samo wywołuje `npm run workshop:reset` (`prisma/workshop-reset.ts`),
    // więc oba sposoby resetu środowiska są równoważne. `getConfig()` czyta
    // stan bezpośrednio z bazy (serwis nie cache'uje go w procesie).
    const result = await resetWorkshopWorkspaces(this.prisma, {
      confirm: dto.confirm
    });
    const config = await this.workshopConfig.getConfig();

    return {
      resetWorkspaceSlugs: result.resetWorkspaceSlugs,
      config: this.toConfigResponse(config)
    };
  }

  /**
   * Workspace'y warsztatowe dostępne do resetu jednego uczestnika (sekcja
   * "Reset uczestnika" w panelu `/admin`). Zwraca WYŁĄCZNIE `slug`, `name` i
   * login konta uczestnika — bez danych pacjentów, haszy czy sesji.
   */
  @Get("workspaces")
  @UseGuards(AdminAuthGuard)
  async listWorkspaces() {
    return listWorkshopWorkspaces(this.prisma);
  }

  /**
   * Reset danych WYŁĄCZNIE JEDNEGO workspace'u warsztatowego (`slug`
   * `warsztat-NN`) — pozostali uczestnicy nie są dotknięci i globalna
   * konfiguracja (`labScenario`/`controlledBug`/`labDelayMs`) nie jest
   * zmieniana. Sesja uczestnika tego workspace'u jest unieważniana tak samo
   * jak przy pełnym resecie środowiska (`resetWorkshopWorkspaces`).
   */
  @Post("workspaces/:slug/reset")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminAuthGuard)
  async resetParticipant(
    @Param("slug") slug: string,
    @Body() dto: AdminResetDto
  ) {
    if (!isWorkshopWorkspaceSlug(slug)) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        "ADMIN_INVALID_WORKSPACE_SLUG",
        "Nieprawidłowy identyfikator workspace'u warsztatowego."
      );
    }

    try {
      const result = await resetSingleWorkshopWorkspace(this.prisma, {
        confirm: dto.confirm,
        workspaceSlug: slug
      });
      return { resetWorkspaceSlug: result.resetWorkspaceSlug };
    } catch (error) {
      if (error instanceof WorkshopWorkspaceNotFoundError) {
        // Workspace o poprawnym formacie sluga, ale nieistniejący (np.
        // usunięty albo z innej liczby uczestników) — bezpieczny 404 zamiast
        // 500. Każdy INNY błąd (DB, transakcja, revoke sesji, reseeding)
        // propaguje dalej — nie jest maskowany jako "nie istnieje".
        throw new ApiErrorException(
          HttpStatus.NOT_FOUND,
          "ADMIN_WORKSPACE_NOT_FOUND",
          "Workspace warsztatowy nie istnieje."
        );
      }
      throw error;
    }
  }

  private async verifyAdminPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await this.passwordService.verify(hash, password);
    } catch {
      // Hash o nieprawidłowym formacie (np. lokalny placeholder z
      // .env.example) traktujemy jak błędne hasło, a nie awarię serwera —
      // logowanie do panelu ma wtedy po prostu zawsze się nie powieść.
      return false;
    }
  }

  private setSessionCookie(reply: FastifyReply, token: string): void {
    reply.header(
      "Set-Cookie",
      buildSetCookie(this.adminSession.cookieName, token, {
        path: "/admin",
        maxAgeSeconds: this.adminSession.ttlSeconds,
        httpOnly: true,
        sameSite: "Strict",
        secure: this.configService.get<string>("NODE_ENV") === "production"
      })
    );
  }

  private clearSessionCookie(reply: FastifyReply): void {
    reply.header(
      "Set-Cookie",
      buildSetCookie(this.adminSession.cookieName, "", {
        path: "/admin",
        maxAgeSeconds: 0,
        httpOnly: true,
        sameSite: "Strict",
        secure: this.configService.get<string>("NODE_ENV") === "production"
      })
    );
  }

  private toConfigResponse(config: WorkshopConfigState) {
    return {
      labScenario: config.labScenario,
      controlledBug: config.controlledBug,
      labDelayMs: config.labDelayMs,
      updatedAt: config.updatedAt.toISOString(),
      availableLabScenarios: LAB_SIMULATOR_SCENARIOS,
      availableControlledBugs: CONTROLLED_BUGS,
      availableLabDelaysMs: LAB_DELAY_PRESETS_MS
    };
  }
}
