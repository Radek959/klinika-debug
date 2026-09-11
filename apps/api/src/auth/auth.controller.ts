import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from "@nestjs/swagger";
import type { AuthenticatedUser, LoginResponse } from "@klinika/api-contracts";
import { ApiErrorResponseDto } from "../common/errors/api-error-response.dto";
import { ApiSessionUnauthorizedResponse } from "../common/openapi/openapi.helpers";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./auth.guard";
import { CurrentSessionId } from "./current-session.decorator";
import { CurrentUser } from "./current-user.decorator";
import { LOGIN_REQUEST_EXAMPLE, LoginDto } from "./dto/login.dto";
import { LoginResponseDto, MeResponseDto } from "./dto/auth-response.dto";

const LOGIN_SUCCESS_EXAMPLE = {
  poprawneLogowanie: {
    summary: "Poprawne logowanie",
    value: {
      token: "sess_9f1c8b7a2e4d4a6c9b0a1f2e3d4c5b6a",
      expiresAt: "2026-09-11T14:00:00.000Z",
      user: {
        id: "cluser0000001",
        login: "tester01",
        displayName: "Tester Warsztatowy",
        role: "STAFF",
        workspace: {
          id: "clworkspace001",
          name: "Warsztat 01",
          slug: "warsztat-01"
        }
      }
    }
  }
};

const INVALID_CREDENTIALS_EXAMPLE = {
  nieprawidloweDane: {
    summary: "Nieprawidłowy login lub hasło",
    value: {
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Login lub hasło są nieprawidłowe.",
        correlationId: "8d0c8cad-9c1b-4d7b-9e3b-0c48288d4fb7"
      }
    }
  }
};

@ApiTags("Uwierzytelnienie")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @HttpCode(200)
  @ApiOperation({
    summary: "Logowanie użytkownika",
    description:
      "Tworzy sesję dla syntetycznego konta personelu i zwraca token sesji (Bearer, nie JWT)."
  })
  @ApiBody({ type: LoginDto, examples: LOGIN_REQUEST_EXAMPLE })
  @ApiOkResponse({
    type: LoginResponseDto,
    examples: LOGIN_SUCCESS_EXAMPLE
  })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: "Żądanie ma nieprawidłową strukturę (np. brak loginu albo hasła)."
  })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: "Nieprawidłowy login lub hasło.",
    examples: INVALID_CREDENTIALS_EXAMPLE
  })
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
  @ApiSessionUnauthorizedResponse()
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
  @ApiNoContentResponse({ description: "Sesja została unieważniona." })
  @ApiSessionUnauthorizedResponse()
  async logout(@CurrentSessionId() sessionId: string): Promise<void> {
    await this.authService.logout(sessionId);
  }
}
