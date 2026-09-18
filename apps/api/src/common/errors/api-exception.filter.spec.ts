import { Logger, ArgumentsHost, BadRequestException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { ApiExceptionFilter } from "./api-exception.filter";

function buildHost(request: Partial<FastifyRequest>, reply: unknown): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => reply
    })
  } as unknown as ArgumentsHost;
}

function buildReply() {
  return {
    header: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn()
  };
}

describe("ApiExceptionFilter", () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("loguje wpis error z correlationId dla statusu >= 500", () => {
    const filter = new ApiExceptionFilter();
    const reply = buildReply();
    const request = {
      headers: {},
      correlationId: "11111111-1111-4111-8111-111111111111",
      method: "POST",
      url: "/api/v1/orders/order-1/send"
    } as unknown as FastifyRequest;

    filter.catch(new Error("boom"), buildHost(request, reply));

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message] = errorSpy.mock.calls[0];
    expect(message).toContain("11111111-1111-4111-8111-111111111111");
    expect(message).toContain("POST");
    expect(message).toContain("/api/v1/orders/order-1/send");
    expect(message).toContain("INTERNAL_SERVER_ERROR");
  });

  it("odcina query string z logowanej ścieżki i pomija Error.message w stack trace", () => {
    const filter = new ApiExceptionFilter();
    const reply = buildReply();
    const request = {
      headers: {},
      correlationId: "44444444-4444-4444-8444-444444444444",
      method: "GET",
      url: "/api/v1/patients?search=90011512345&token=secret"
    } as unknown as FastifyRequest;

    const exception = new Error("wrażliwy komunikat: 90011512345");
    filter.catch(exception, buildHost(request, reply));

    const [message, stack] = errorSpy.mock.calls[0];
    expect(message).toContain("/api/v1/patients");
    expect(message).not.toContain("search=");
    expect(message).not.toContain("token=secret");
    expect(message).not.toContain("90011512345");

    const loggedText = `${message} ${stack ?? ""}`;
    expect(loggedText).not.toContain("wrażliwy komunikat");
    expect(loggedText).not.toContain("90011512345");
    if (stack) {
      for (const line of stack.split("\n")) {
        expect(line.trim().startsWith("at ")).toBe(true);
      }
    }
  });

  it("nie loguje niczego dla błędów 4xx", () => {
    const filter = new ApiExceptionFilter();
    const reply = buildReply();
    const request = {
      headers: {},
      correlationId: "22222222-2222-4222-8222-222222222222",
      method: "GET",
      url: "/api/v1/patients/does-not-exist"
    } as unknown as FastifyRequest;

    filter.catch(new BadRequestException("Żądanie zawiera nieprawidłowe dane."), buildHost(request, reply));

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("nie loguje treści body/query/danych wrażliwych — tylko metodę, pathname, kod i correlationId", () => {
    const filter = new ApiExceptionFilter();
    const reply = buildReply();
    const correlationId = "33333333-3333-4333-8333-333333333333";
    const request = {
      headers: {},
      correlationId,
      method: "POST",
      url: "/api/v1/patients?search=90011512345&token=SekretnyToken123",
      body: { pesel: "90011512345", phone: "+48123456789", password: "tajne-haslo" }
    } as unknown as FastifyRequest;

    const exception = new Error("secret leak check pesel=90011512345 phone=+48123456789");
    filter.catch(exception, buildHost(request, reply));

    const [message, stack] = errorSpy.mock.calls[0];
    const loggedText = `${message} ${stack ?? ""}`;

    expect(loggedText).not.toContain("90011512345");
    expect(loggedText).not.toContain("+48123456789");
    expect(loggedText).not.toContain("tajne-haslo");
    expect(loggedText).not.toContain("SekretnyToken123");
    expect(loggedText).not.toContain("search=");
    expect(loggedText).not.toContain("secret leak check");

    expect(message).toContain(correlationId);
    expect(message).toContain("POST");
    expect(message).toContain("/api/v1/patients");
    expect(message).toContain("INTERNAL_SERVER_ERROR");
  });
});
