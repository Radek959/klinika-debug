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
      transform: true,
      exceptionFactory: (errors) =>
        new ApiErrorException(
          HttpStatus.BAD_REQUEST,
          "VALIDATION_ERROR",
          "Żądanie zawiera nieprawidłowe dane.",
          flattenValidationErrors(errors)
        )
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

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = ""
): { field: string; code: string; message: string }[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const ownErrors = Object.entries(error.constraints ?? {}).map(
      ([code, message]) => ({
        field,
        code,
        message
      })
    );
    return [
      ...ownErrors,
      ...flattenValidationErrors(error.children ?? [], field)
    ];
  });
}
