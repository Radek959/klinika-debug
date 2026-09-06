/**
 * Validators and utilities for orders list functionality
 */

export interface OrdersListValidationError {
  field: string;
  code: string;
}

/**
 * Parses and validates a date string in YYYY-MM-DD format.
 * Returns null if the string is empty/invalid, or throws an error if the format is wrong.
 */
export function parseDate(
  dateStr: string | undefined,
  fieldName: string
): Date | null {
  if (!dateStr) {
    return null;
  }

  const trimmed = dateStr.trim();
  if (!trimmed) {
    return null;
  }

  // Validate format YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(trimmed)) {
    throw {
      field: fieldName,
      code: "INVALID_DATE_FORMAT"
    } as OrdersListValidationError;
  }

  // Parse and validate the date
  const date = new Date(trimmed + "T00:00:00.000Z");

  // Check if date is valid
  if (isNaN(date.getTime())) {
    throw {
      field: fieldName,
      code: "INVALID_DATE_FORMAT"
    } as OrdersListValidationError;
  }

  // Validate that the date string matches the parsed date
  // This catches invalid dates like 2026-02-30
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const reconstructed = `${year}-${month}-${day}`;

  if (reconstructed !== trimmed) {
    throw {
      field: fieldName,
      code: "INVALID_DATE_FORMAT"
    } as OrdersListValidationError;
  }

  return date;
}

/**
 * Converts createdTo date to the exclusive start of the next day in UTC
 * Example: 2026-09-06 becomes 2026-09-07T00:00:00.000Z
 */
export function normalizeCreatedToDate(date: Date): Date {
  const nextDay = new Date(date);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return nextDay;
}

/**
 * Validates the date range.
 * Returns errors if createdFrom is after createdTo.
 */
export function validateDateRange(
  createdFrom: Date | null,
  createdTo: Date | null
): OrdersListValidationError[] {
  if (createdFrom && createdTo && createdFrom > createdTo) {
    return [
      {
        field: "createdFrom",
        code: "INVALID_DATE_RANGE"
      },
      {
        field: "createdTo",
        code: "INVALID_DATE_RANGE"
      }
    ];
  }

  return [];
}

/**
 * Normalizes search term by trimming whitespace.
 * Returns null if the result is empty.
 */
export function normalizeSearch(search: string | undefined): string | null {
  if (!search) {
    return null;
  }

  const trimmed = search.trim();
  return trimmed ? trimmed : null;
}

/**
 * Material type sort order for stable sorting
 */
export const MATERIAL_TYPE_SORT_ORDER: Record<string, number> = {
  EDTA_BLOOD: 0,
  SERUM: 1,
  URINE: 2
};

export function sortMaterialTypes(left: string, right: string): number {
  return (
    (MATERIAL_TYPE_SORT_ORDER[left] ?? Number.MAX_SAFE_INTEGER) -
    (MATERIAL_TYPE_SORT_ORDER[right] ?? Number.MAX_SAFE_INTEGER)
  );
}
