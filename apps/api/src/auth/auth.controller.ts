import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";
import type { AuthenticatedUser, LoginResponse } from "@klinika/api-contracts";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./auth.guard";
import { CurrentSessionId } from "./current-session.decorator";
import { CurrentUser } from "./current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { LoginResponseDto, MeResponseDto } from "./dto/auth-response.dto";

@ApiTags("Uwierzytelnienie")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @HttpCode(200)
  @ApiOperation({
    summary: "Logowanie użytkownika",
    description:
      "Tworzy sesję dla syntetycznego konta personelu i zwraca token Bearer."
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: "Nieprawidłowy login lub hasło." })
  login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(dto.login, dto.password);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Bieżący użytkownik",
    description:
      "Zwraca podstawowe dane zalogowanego użytkownika oraz jego workspace."
  })
  @ApiOkResponse({ type: MeResponseDto })
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  @Post("logout")
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Wylogowanie",
    description: "Unieważnia aktywną sesję użytkownika."
  })
  async logout(@CurrentSessionId() sessionId: string): Promise<void> {
    await this.authService.logout(sessionId);
  }
}
