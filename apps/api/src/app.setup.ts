import { HttpStatus, RequestMethod, ValidationPipe } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
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
          errors.flatMap((error) =>
            Object.entries(error.constraints ?? {}).map(([code, message]) => ({
              field: error.property,
              code,
              message
            }))
          )
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
