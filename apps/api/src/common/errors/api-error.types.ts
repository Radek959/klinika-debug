export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    correlationId: string;
    fieldErrors?: FieldError[];
  };
}
