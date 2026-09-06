import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type MedicalTest } from "@prisma/client";
import {
  calculateRequiredMaterials,
  findDuplicateMedicalTestSelections,
  validateOrderAdditionalData,
  type NormalizedOrderTestSelection,
  type OrderMedicalTestDefinition,
  type OrderValidationFieldError
} from "@klinika/domain";
import type { CreateOrderRequest, OrderResponse } from "@klinika/api-contracts";
import { ApiErrorException } from "../common/errors/api-error.exception";
import { PrismaService } from "../common/prisma/prisma.service";
import { toOrderResponse } from "./orders.mapper";

type MedicalTestWithRequiredFields = MedicalTest & {
  requiredFields: Array<{
    code: string;
    valueType: "BOOLEAN" | "TEXT";
    required: boolean;
  }>;
};

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    workspaceId: string,
    createdByUserId: string,
    input: CreateOrderRequest
  ): Promise<OrderResponse> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: input.patientId, workspaceId },
      select: { id: true, active: true }
    });

    if (!patient) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        "PATIENT_NOT_FOUND",
        "Nie znaleziono pacjenta."
      );
    }

    if (!patient.active) {
      throw this.orderValidationError([
        { field: "patientId", code: "PATIENT_INACTIVE" }
      ]);
    }

    const validation = await this.validateOrderInput(input);
    if (!validation.valid) {
      throw this.orderValidationError(validation.errors);
    }

    const sortedCatalog = [...validation.catalog].sort((a, b) =>
      a.code.localeCompare(b.code)
    );
    const normalizedById = new Map(
      validation.tests.map((test) => [test.medicalTestId, test])
    );
    const sampleMaterials = calculateRequiredMaterials(validation.catalog);

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          workspaceId,
          patientId: patient.id,
          createdByUserId,
          priority: input.priority,
          status: "DRAFT"
        }
      });

      const orderTests = [];
      for (const catalogItem of sortedCatalog) {
        const normalized = normalizedById.get(catalogItem.id);
        const orderTest = await tx.orderTest.create({
          data: {
            workspaceId,
            orderId: order.id,
            medicalTestId: catalogItem.id,
            additionalData: this.toPrismaJson(normalized?.additionalData ?? null)
          },
          include: {
            medicalTest: {
              select: { code: true, name: true, materialType: true }
            }
          }
        });
        orderTests.push(orderTest);
      }

      const samples = [];
      for (const materialType of sampleMaterials) {
        samples.push(
          await tx.sample.create({
            data: {
              workspaceId,
              orderId: order.id,
              materialType,
              status: "REQUIRED",
              barcode: null,
              collectedAt: null,
              collectedByUserId: null,
              rejectionCode: null,
              rejectionReason: null
            }
          })
        );
      }

      return { order, orderTests, samples };
    });

    return toOrderResponse(result.order, result.orderTests, result.samples);
  }

  private async validateOrderInput(input: CreateOrderRequest): Promise<
    | {
        valid: true;
        tests: NormalizedOrderTestSelection[];
        catalog: MedicalTestWithRequiredFields[];
      }
    | { valid: false; errors: OrderValidationFieldError[] }
  > {
    if (!input.tests.length) {
      return {
        valid: false,
        errors: [{ field: "tests", code: "TESTS_REQUIRED" }]
      };
    }

    const duplicateErrors = findDuplicateMedicalTestSelections(input.tests);
    if (duplicateErrors.length) {
      return { valid: false, errors: duplicateErrors };
    }

    const requestedIds = input.tests.map((test) => test.medicalTestId);
    const catalog = await this.prisma.medicalTest.findMany({
      where: { id: { in: requestedIds } },
      include: {
        requiredFields: {
          select: { code: true, valueType: true, required: true }
        }
      }
    });
    const catalogById = new Map(catalog.map((test) => [test.id, test]));

    const catalogErrors: OrderValidationFieldError[] = [];
    for (const [index, test] of input.tests.entries()) {
      const catalogItem = catalogById.get(test.medicalTestId);
      if (!catalogItem) {
        catalogErrors.push({
          field: `tests.${index}.medicalTestId`,
          code: "MEDICAL_TEST_NOT_FOUND"
        });
        continue;
      }
      if (!catalogItem.active) {
        catalogErrors.push({
          field: `tests.${index}.medicalTestId`,
          code: "MEDICAL_TEST_INACTIVE"
        });
      }
    }

    if (catalogErrors.length) {
      return { valid: false, errors: catalogErrors };
    }

    const domainCatalog = new Map<string, OrderMedicalTestDefinition>(
      catalog.map((test) => [
        test.id,
        {
          id: test.id,
          materialType: test.materialType,
          requiredFields: test.requiredFields
        }
      ])
    );
    const additionalDataValidation = validateOrderAdditionalData(
      input.tests,
      domainCatalog
    );

    if (!additionalDataValidation.valid) {
      return { valid: false, errors: additionalDataValidation.errors };
    }

    return {
      valid: true,
      tests: additionalDataValidation.value,
      catalog
    };
  }

  private orderValidationError(errors: OrderValidationFieldError[]) {
    return new ApiErrorException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "ORDER_VALIDATION_ERROR",
      "Nie udało się utworzyć zlecenia.",
      errors.map((error) => ({
        ...error,
        message: this.fieldErrorMessage(error.code)
      }))
    );
  }

  private fieldErrorMessage(code: string): string {
    const messages: Record<string, string> = {
      PATIENT_INACTIVE:
        "Nie można utworzyć zlecenia dla nieaktywnego pacjenta.",
      TESTS_REQUIRED: "Zlecenie musi zawierać co najmniej jedno badanie.",
      DUPLICATE_TEST: "To samo badanie nie może wystąpić w zleceniu więcej niż raz.",
      MEDICAL_TEST_NOT_FOUND: "Nie znaleziono aktywnego badania w katalogu.",
      MEDICAL_TEST_INACTIVE:
        "Nieaktywnego badania nie można dodać do nowego zlecenia.",
      REQUIRED_ADDITIONAL_DATA:
        "Wymagane dane dodatkowe dla badania nie zostały uzupełnione.",
      INVALID_ADDITIONAL_DATA_TYPE:
        "Dane dodatkowe mają nieprawidłowy typ albo pustą wartość.",
      UNKNOWN_ADDITIONAL_DATA_FIELD:
        "Dane dodatkowe zawierają pole niezdefiniowane dla tego badania."
    };
    return messages[code] ?? "Zlecenie zawiera nieprawidłowe dane.";
  }

  private toPrismaJson(
    value: NormalizedOrderTestSelection["additionalData"]
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
    return value ?? Prisma.JsonNull;
  }
}
