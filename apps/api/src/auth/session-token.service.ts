import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes } from "node:crypto";

@Injectable()
export class SessionTokenService {
  constructor(private readonly configService: ConfigService) {}

  generateToken(): string {
    return randomBytes(32).toString("base64url");
  }

  hashToken(token: string): string {
    const pepper = this.configService.getOrThrow<string>("SESSION_TOKEN_PEPPER");
    return createHash("sha256").update(`${token}.${pepper}`).digest("hex");
  }
}
