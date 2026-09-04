import {
  HttpStatus,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import type { AuthenticatedUser, LoginResponse } from "@klinika/api-contracts";
import {
  calculateSessionExpiry,
  isSessionActive
} from "@klinika/domain";
import { PrismaService } from "../common/prisma/prisma.service";
import { ApiErrorException } from "../common/errors/api-error.exception";
import { PasswordService } from "./password.service";
import { SessionTokenService } from "./session-token.service";
import type { UserWithWorkspace } from "./auth.types";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionTokenService: SessionTokenService
  ) {}

  async login(login: string, password: string): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({
      where: { login },
      include: { workspace: true }
    });

    if (!user?.active) {
      throw this.invalidCredentials();
    }

    const passwordMatches = await this.passwordService.verify(
      user.passwordHash,
      password
    );

    if (!passwordMatches) {
      throw this.invalidCredentials();
    }

    const token = this.sessionTokenService.generateToken();
    const now = new Date();
    const expiresAt = calculateSessionExpiry(now);

    await this.prisma.userSession.create({
      data: {
        userId: user.id,
        tokenHash: this.sessionTokenService.hashToken(token),
        lastActivityAt: now,
        expiresAt
      }
    });

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      user: this.toAuthenticatedUser(user)
    };
  }

  async authenticateToken(token: string): Promise<{
    user: AuthenticatedUser;
    sessionId: string;
  }> {
    const tokenHash = this.sessionTokenService.hashToken(token);
    const session = await this.prisma.userSession.findUnique({
      where: { tokenHash },
      include: { user: { include: { workspace: true } } }
    });

    const now = new Date();
    if (
      !session ||
      !session.user.active ||
      !isSessionActive(now, session.expiresAt, session.revokedAt)
    ) {
      throw new UnauthorizedException({
        code: "SESSION_EXPIRED",
        message: "Sesja wygasła albo token jest nieprawidłowy."
      });
    }

    const expiresAt = calculateSessionExpiry(now);
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: {
        lastActivityAt: now,
        expiresAt
      }
    });

    return {
      sessionId: session.id,
      user: this.toAuthenticatedUser(session.user)
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() }
    });
  }

  private toAuthenticatedUser(user: UserWithWorkspace): AuthenticatedUser {
    return {
      id: user.id,
      login: user.login,
      displayName: user.displayName,
      role: user.role,
      workspace: {
        id: user.workspace.id,
        name: user.workspace.name,
        slug: user.workspace.slug
      }
    };
  }

  private invalidCredentials(): ApiErrorException {
    return new ApiErrorException(
      HttpStatus.UNAUTHORIZED,
      "INVALID_CREDENTIALS",
      "Login lub hasło są nieprawidłowe."
    );
  }
}
