import { ConfigService } from "@nestjs/config";
import { AdminSessionService } from "./admin-session.service";

function createService(secret = "test-admin-session-secret-value") {
  const configService = new ConfigService({ ADMIN_SESSION_SECRET: secret });
  return new AdminSessionService(configService);
}

describe("AdminSessionService", () => {
  it("wydany token jest ważny natychmiast po utworzeniu", () => {
    const service = createService();
    const now = new Date("2026-09-08T10:00:00.000Z");

    const token = service.createToken(now);

    expect(service.verifyToken(token, now)).toBe(true);
  });

  it("token wygasa po upływie czasu życia sesji", () => {
    const service = createService();
    const issuedAt = new Date("2026-09-08T10:00:00.000Z");
    const token = service.createToken(issuedAt);

    const justBeforeExpiry = new Date(issuedAt.getTime() + service.ttlSeconds * 1000 - 1000);
    const justAfterExpiry = new Date(issuedAt.getTime() + service.ttlSeconds * 1000 + 1000);

    expect(service.verifyToken(token, justBeforeExpiry)).toBe(true);
    expect(service.verifyToken(token, justAfterExpiry)).toBe(false);
  });

  it("odrzuca token 'z przyszłości' (ujemny wiek)", () => {
    const service = createService();
    const issuedAt = new Date("2026-09-08T10:00:00.000Z");
    const token = service.createToken(issuedAt);

    const before = new Date(issuedAt.getTime() - 5000);

    expect(service.verifyToken(token, before)).toBe(false);
  });

  it("odrzuca brakujący, pusty albo losowo sfałszowany token", () => {
    const service = createService();

    expect(service.verifyToken(undefined)).toBe(false);
    expect(service.verifyToken("")).toBe(false);
    expect(service.verifyToken("not-a-real-token")).toBe(false);
    expect(service.verifyToken("1700000000000.deadbeef")).toBe(false);
  });

  it("odrzuca token podpisany innym sekretem", () => {
    const serviceA = createService("sekret-a-wystarczajaco-dlugi");
    const serviceB = createService("sekret-b-wystarczajaco-dlugi");
    const now = new Date("2026-09-08T10:00:00.000Z");

    const token = serviceA.createToken(now);

    expect(serviceB.verifyToken(token, now)).toBe(false);
  });

  it("nie modyfikuje treści payloadu przy manipulacji sygnatury", () => {
    const service = createService();
    const now = new Date("2026-09-08T10:00:00.000Z");
    const token = service.createToken(now);
    const [issuedAt] = token.split(".");
    const tampered = `${issuedAt}.0000000000000000000000000000000000000000000000000000000000000000`;

    expect(service.verifyToken(tampered, now)).toBe(false);
  });
});
