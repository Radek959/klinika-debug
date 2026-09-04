import { HttpException, HttpStatus } from "@nestjs/common";
import type { FieldError } from "./api-error.types";

export class ApiErrorException extends HttpException {
  constructor(
    status: HttpStatus,
    code: string,
    message: string,
    readonly fieldErrors?: FieldError[]
  ) {
    super({ code, message, fieldErrors }, status);
  }
}
