import { HttpStatus, RequestMethod, ValidationPipe } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { ValidationError } from "class-validator";
import { ApiErrorException } from "./common/errors/api-error.exception";
import { ApiExceptionFilter } from "./common/errors/api-exception.filter";

export function configureApp(app: NestFastifyApplication) {
  app.setGlobalPrefix("api/v1", {
    exclude: [
      { path: "health/live", method: RequestMethod.GET },
      { path: "health/ready", method: RequestMethod.GET }
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
    .setDescription("Dokumentacja REST API środowiska Klinika Debug.")
    .setVersion("0.1.0")
    .addBearerAuth()
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
