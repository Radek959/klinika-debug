import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Res,
  UseGuards
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiExcludeController } from "@nestjs/swagger";
import type { FastifyReply } from "fastify";
import { ApiErrorException } from "../common/errors/api-error.exception";
import { PrismaService } from "../common/prisma/prisma.service";
import { resetWorkshopWorkspaces } from "../common/prisma/reset-workshop";
import { PasswordService } from "../auth/password.service";
import { LAB_SIMULATOR_SCENARIOS } from "../lab-simulator/lab-simulator-scenario";
import { CONTROLLED_BUGS } from "../workshop-config/controlled-bug";
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
      controlledBug: dto.controlledBug as WorkshopConfigState["controlledBug"]
    });
    return this.toConfigResponse(config);
  }

  @Post("reset")
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminAuthGuard)
  async reset(@Body() dto: AdminResetDto) {
    const result = await resetWorkshopWorkspaces(this.prisma, {
      confirm: dto.confirm
    });
    const config = await this.workshopConfig.resetToDefaults();

    return {
      resetWorkspaceSlugs: result.resetWorkspaceSlugs,
      config: this.toConfigResponse(config)
    };
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
      updatedAt: config.updatedAt.toISOString(),
      availableLabScenarios: LAB_SIMULATOR_SCENARIOS,
      availableControlledBugs: CONTROLLED_BUGS
    };
  }
}
