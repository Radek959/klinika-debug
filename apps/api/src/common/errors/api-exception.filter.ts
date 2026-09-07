import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  CORRELATION_ID_HEADER,
  resolveCorrelationId
} from "../correlation/correlation-id";
import type {
  ApiErrorBody,
  ApiErrorResponseHeaders,
  FieldError
} from "./api-error.types";

interface ExceptionPayload {
  code?: string;
  message?: string | string[];
  fieldErrors?: FieldError[];
  responseHeaders?: ApiErrorResponseHeaders;
}

/**
 * Nagłówki, które ścieżka błędu może ustawić poza `X-Correlation-ID`.
 *
 * Whitelista jest jawna: treść wyjątku nie może ustawić dowolnego nagłówka
 * odpowiedzi HTTP.
 */
const ALLOWED_ERROR_HEADERS = ["Retry-After"] as const;

interface ReplyLike {
  header?: (name: string, value: string) => ReplyLike;
  status?: (statusCode: number) => ReplyLike;
  send?: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
  end?: (body: string) => void;
  statusCode?: number;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<ReplyLike>();
    const correlationId = resolveCorrelationId(
      request.headers,
      request.correlationId
    );

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const response =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const payload = this.normalizePayload(response);

    const body: ApiErrorBody = {
      error: {
        code: payload.code ?? this.defaultCode(status),
        message:
          payload.code && payload.message
            ? payload.message
            : this.defaultMessage(status),
        correlationId
      }
    };

    if (payload.fieldErrors?.length) {
      body.error.fieldErrors = payload.fieldErrors;
    }

    this.send(reply, status, correlationId, body, payload.responseHeaders);
  }

  private send(
    reply: ReplyLike,
    status: number,
    correlationId: string,
    body: ApiErrorBody,
    responseHeaders?: ApiErrorResponseHeaders
  ) {
    const extraHeaders = this.pickAllowedHeaders(responseHeaders);
    const setHeader = reply.header;
    const setStatus = reply.status;
    const send = reply.send;

    if (setHeader && setStatus && send) {
      setHeader.call(reply, CORRELATION_ID_HEADER, correlationId);
      for (const [name, value] of extraHeaders) {
        setHeader.call(reply, name, value);
      }
      setStatus.call(reply, status);
      send.call(reply, body);
      return;
    }

    reply.statusCode = status;
    reply.setHeader?.(CORRELATION_ID_HEADER, correlationId);
    for (const [name, value] of extraHeaders) {
      reply.setHeader?.(name, value);
    }
    reply.setHeader?.("Content-Type", "application/json; charset=utf-8");
    reply.end?.(JSON.stringify(body));
  }

  private pickAllowedHeaders(
    responseHeaders?: ApiErrorResponseHeaders
  ): Array<[string, string]> {
    if (!responseHeaders) {
      return [];
    }

    const picked: Array<[string, string]> = [];
    for (const name of ALLOWED_ERROR_HEADERS) {
      const value = responseHeaders[name];
      if (typeof value === "string" && value.length > 0) {
        picked.push([name, value]);
      }
    }
    return picked;
  }

  private normalizePayload(response: unknown): {
    code?: string;
    message?: string;
    fieldErrors?: FieldError[];
    responseHeaders?: ApiErrorResponseHeaders;
  } {
    if (typeof response === "string") {
      return {};
    }

    if (!response || typeof response !== "object") {
      return {};
    }

    const payload = response as ExceptionPayload;
    const message = Array.isArray(payload.message)
      ? "Żądanie zawiera nieprawidłowe dane."
      : payload.message;

    return {
      code: payload.code,
      message,
      fieldErrors: payload.fieldErrors,
      responseHeaders: payload.responseHeaders
    };
  }

  private defaultCode(status: number): string {
    if (status === HttpStatus.UNAUTHORIZED) {
      return "AUTHENTICATION_REQUIRED";
    }
    if (status === HttpStatus.NOT_FOUND) {
      return "RESOURCE_NOT_FOUND";
    }
    if (status === HttpStatus.BAD_REQUEST) {
      return "VALIDATION_ERROR";
    }
    return "INTERNAL_SERVER_ERROR";
  }

  private defaultMessage(status: number): string {
    if (status === HttpStatus.UNAUTHORIZED) {
      return "Wymagane jest poprawne uwierzytelnienie.";
    }
    if (status === HttpStatus.NOT_FOUND) {
      return "Nie znaleziono zasobu.";
    }
    if (status === HttpStatus.BAD_REQUEST) {
      return "Żądanie zawiera nieprawidłowe dane.";
    }
    return "Wystąpił nieoczekiwany błąd systemu.";
  }
}
