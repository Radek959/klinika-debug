import { HttpStatus, RequestMethod, ValidationPipe } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { ValidationError } from "class-validator";
import { ApiErrorException } from "./common/errors/api-error.exception";
import { ApiExceptionFilter } from "./common/errors/api-exception.filter";

const SWAGGER_DESCRIPTION = `Dokumentacja REST API środowiska Klinika Debug — środowiska ćwiczeniowego do warsztatu testerskiego.

## Szybki start

1. Zaloguj się: **POST /api/v1/auth/login**.
2. Skopiuj pole \`token\` z odpowiedzi.
3. Kliknij **Authorize** i podaj token jako Bearer token.
4. Pobierz \`patientId\` z **GET /api/v1/patients** (albo utwórz pacjenta przez POST).
5. Pobierz \`medicalTestId\` z **GET /api/v1/tests**.
6. Utwórz zlecenie: **POST /api/v1/orders**.
7. Zarejestruj wymagane próbki: **POST /api/v1/orders/{orderId}/samples**.
8. Wyślij zlecenie do laboratorium: **POST /api/v1/orders/{orderId}/send**.
9. Sprawdzaj szczegóły (**GET /api/v1/orders/{orderId}**) i historię operacji (**GET /api/v1/orders/{orderId}/history**).

## Ważne informacje

- Workspace (placówka) wynika wyłącznie z aktywnej sesji i nigdy nie jest podawany w treści requestu.
- Wszystkie dane w tym środowisku są syntetyczne — nie zawierają prawdziwych danych pacjentów.
- Techniczne nazwy pól, endpointów i wartości enum są po angielsku; opisy, etykiety i komunikaty błędów są po polsku.
- Nagłówek \`X-Correlation-ID\` łączy request, ewentualny błąd, wpis historii zlecenia i logi serwera. Można podać własną
  wartość (musi być poprawnym UUID) — API zawsze zwraca identyfikator korelacji w odpowiedzi, a przy błędzie ta sama
  wartość znajduje się też w polu \`error.correlationId\`.
- Uwierzytelnienie Bearer to token sesji uczestnika (login przez POST /api/v1/auth/login), a nie token JWT.`;

export function configureApp(app: NestFastifyApplication) {
  app.setGlobalPrefix("api/v1", {
    exclude: [
      { path: "health/live", method: RequestMethod.GET },
      { path: "health/ready", method: RequestMethod.GET },
      // Panel prowadzącego (`/admin`) jest narzędziem technicznym, celowo
      // POZA `/api/v1` i poza uprawnieniami STAFF (AGENTS.md).
      { path: "admin", method: RequestMethod.ALL },
      { path: "admin/*", method: RequestMethod.ALL }
    ]
  });

  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory
    })
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Klinika Debug API")
    .setDescription(SWAGGER_DESCRIPTION)
    .setVersion("0.1.0")
    .addBearerAuth({
      type: "http",
      scheme: "bearer",
      description:
        "Token sesji uczestnika (nie jest to JWT). Zaloguj się przez POST /api/v1/auth/login, skopiuj pole " +
        "token z odpowiedzi i podaj je tutaj jako Bearer token."
    })
    .addTag("Uwierzytelnienie", "Logowanie, bieżąca sesja i wylogowanie personelu.")
    .addTag(
      "Pacjenci",
      "Rejestr pacjentów bieżącego workspace'u: PESEL, inny dokument oraz opcjonalny opiekun."
    )
    .addTag(
      "Katalog badań",
      "Wspólny, tylko-do-odczytu katalog badań dostępny dla wszystkich workspace'ów."
    )
    .addTag(
      "Zlecenia",
      "Zlecenia badań: tworzenie, edycja wersji roboczej, rejestracja próbek, wysyłka do laboratorium i historia."
    )
    .addTag(
      "Panel główny",
      "Zagregowane podsumowanie liczby pacjentów i zleceń bieżącego workspace'u."
    )
    .addTag(
      "Stan aplikacji",
      "Techniczne endpointy sprawdzające, czy proces API działa i jest gotowy do obsługi ruchu."
    )
    .addTag(
      "Integracja z laboratorium",
      "Techniczny webhook symulatora laboratorium. Osobne uwierzytelnienie, poza sesją uczestnika."
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document, {
    useGlobalPrefix: false,
    customSiteTitle: "Klinika Debug API"
  });
}

export function validationExceptionFactory(errors: ValidationError[]) {
  return new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    "VALIDATION_ERROR",
    "Żądanie zawiera nieprawidłowe dane.",
    flattenValidationErrors(errors)
  );
}

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = ""
): { field: string; code: string; message: string }[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const ownErrors = Object.entries(error.constraints ?? {}).map(
      ([code, message]) => ({
        field,
        code: mapValidationErrorCode(field, code),
        message:
          code === "whitelistValidation"
            ? "Pole nie jest dozwolone."
            : message
      })
    );
    return [
      ...ownErrors,
      ...flattenValidationErrors(error.children ?? [], field)
    ];
  });
}

function mapValidationErrorCode(field: string, classValidatorCode: string): string {
  // Map class-validator codes to domain-specific error codes
  const codeMap: Record<string, Record<string, string>> = {
    page: { min: "INVALID_PAGE", isInt: "INVALID_PAGE" },
    pageSize: { min: "INVALID_PAGE_SIZE", max: "INVALID_PAGE_SIZE", isInt: "INVALID_PAGE_SIZE" },
    status: { isEnum: "INVALID_STATUS" },
    priority: { isEnum: "INVALID_PRIORITY" },
    materialType: { isEnum: "INVALID_MATERIAL_TYPE", isIn: "INVALID_MATERIAL_TYPE" },
    createdFrom: { custom: "INVALID_DATE" },
    createdTo: { custom: "INVALID_DATE" },
    sort: { isEnum: "INVALID_SORT" },
    order: { isEnum: "INVALID_ORDER" },
    barcode: { isString: "BARCODE_REQUIRED", isNotEmpty: "BARCODE_REQUIRED" },
    collectedAt: { isIso8601: "INVALID_DATE_FORMAT" }
  };

  if (classValidatorCode === "whitelistValidation") {
    return "UNKNOWN_FIELD";
  }

  return codeMap[field]?.[classValidatorCode] ?? classValidatorCode;
}
