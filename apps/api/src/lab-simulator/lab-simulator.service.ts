import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  computePartialSuccessCallbackOffsets,
  generateSyntheticResult,
  splitMedicalTestIdsForPartialSuccess
} from "@klinika/domain";
import type { LabResultTestPayload, LabResultsWebhookRequest } from "@klinika/api-contracts";
import { resolveLabSimulatorScenario } from "./lab-simulator-scenario";

export interface LabSimulatorParameterInput {
  code: string;
  valueType: "NUMERIC" | "TEXT";
  unit: string | null;
}

export interface LabSimulatorTestInput {
  medicalTestId: string;
  parameters: LabSimulatorParameterInput[];
}

export interface LabSimulatorOrderInput {
  workspaceId: string;
  orderId: string;
  tests: LabSimulatorTestInput[];
}

export interface LabSimulatorScheduledJob {
  scenario: string;
  executeAt: Date;
  payload: LabResultsWebhookRequest;
}

export interface LabSimulatorOrderResult {
  externalOrderId: string;
  estimatedCompletionAt: Date;
  jobs: LabSimulatorScheduledJob[];
}

// Domyślny tryb CLEAN/SUCCESS: 300 sekund do przewidywanego zakończenia realizacji.
const DEFAULT_ESTIMATED_COMPLETION_DELAY_MS = 300_000;

@Injectable()
export class LabSimulatorService {
  acceptOrder(input: LabSimulatorOrderInput): LabSimulatorOrderResult {
    const externalOrderId = `EXT-${randomUUID()}`;
    const scenario = resolveLabSimulatorScenario();
    const delayMs = this.getDelayMs();

    if (scenario === "PARTIAL_SUCCESS" && input.tests.length >= 2) {
      return this.buildPartialSuccessResult(input, externalOrderId, delayMs);
    }

    // Zachowanie SUCCESS. Jest też jawnym, przetestowanym fallbackiem dla
    // scenariusza PARTIAL_SUCCESS przy zleceniu z jednym badaniem: nie da się
    // wtedy zbudować dwóch niepustych podzbiorów badań, a dzielenie
    // pojedynczego badania po parametrach nie jest wynikiem częściowym w
    // rozumieniu dokumentacji produktowej. W takim przypadku nie tworzymy
    // sztucznego callbacka PARTIAL bez wyników — zlecenie od razu otrzymuje
    // komplet wyników i status COMPLETED, tak jak w scenariuszu SUCCESS.
    return this.buildSuccessResult(input, externalOrderId, delayMs);
  }

  private buildSuccessResult(
    input: LabSimulatorOrderInput,
    externalOrderId: string,
    delayMs: number
  ): LabSimulatorOrderResult {
    const estimatedCompletionAt = new Date(Date.now() + delayMs);
    const results = input.tests.map((test) => this.buildTestResultPayload(input.orderId, test));

    const payload: LabResultsWebhookRequest = {
      externalOrderId,
      eventId: randomUUID(),
      correlationId: null,
      status: "COMPLETED",
      results,
      pendingMedicalTestIds: []
    };

    return {
      externalOrderId,
      estimatedCompletionAt,
      jobs: [
        {
          scenario: "SUCCESS",
          executeAt: estimatedCompletionAt,
          payload
        }
      ]
    };
  }

  private buildPartialSuccessResult(
    input: LabSimulatorOrderInput,
    externalOrderId: string,
    delayMs: number
  ): LabSimulatorOrderResult {
    const testsById = new Map(input.tests.map((test) => [test.medicalTestId, test]));
    const { firstBatchTestIds, secondBatchTestIds } = splitMedicalTestIdsForPartialSuccess(
      input.tests.map((test) => test.medicalTestId)
    );
    const { firstCallbackOffsetMs, finalCallbackOffsetMs } =
      computePartialSuccessCallbackOffsets(delayMs);

    const now = Date.now();
    const firstCallbackAt = new Date(now + firstCallbackOffsetMs);
    const estimatedCompletionAt = new Date(now + finalCallbackOffsetMs);

    const firstResults = firstBatchTestIds.map((medicalTestId) =>
      this.buildTestResultPayload(input.orderId, testsById.get(medicalTestId)!)
    );
    const secondResults = secondBatchTestIds.map((medicalTestId) =>
      this.buildTestResultPayload(input.orderId, testsById.get(medicalTestId)!)
    );

    const partialPayload: LabResultsWebhookRequest = {
      externalOrderId,
      eventId: randomUUID(),
      correlationId: null,
      status: "PARTIAL",
      results: firstResults,
      pendingMedicalTestIds: secondBatchTestIds
    };

    const completionPayload: LabResultsWebhookRequest = {
      externalOrderId,
      eventId: randomUUID(),
      correlationId: null,
      status: "COMPLETED",
      results: secondResults,
      pendingMedicalTestIds: []
    };

    return {
      externalOrderId,
      estimatedCompletionAt,
      jobs: [
        {
          scenario: "PARTIAL_SUCCESS",
          executeAt: firstCallbackAt,
          payload: partialPayload
        },
        {
          scenario: "PARTIAL_SUCCESS",
          executeAt: estimatedCompletionAt,
          payload: completionPayload
        }
      ]
    };
  }

  private buildTestResultPayload(
    orderId: string,
    test: LabSimulatorTestInput
  ): LabResultTestPayload {
    return {
      medicalTestId: test.medicalTestId,
      parameters: test.parameters.map((parameter) =>
        generateSyntheticResult(`${orderId}:${test.medicalTestId}:${parameter.code}`, parameter)
      )
    };
  }

  private getDelayMs(): number {
    const configured = Number(process.env.LAB_SIMULATOR_DELAY_MS);
    return Number.isFinite(configured) && configured >= 0
      ? configured
      : DEFAULT_ESTIMATED_COMPLETION_DELAY_MS;
  }
}
