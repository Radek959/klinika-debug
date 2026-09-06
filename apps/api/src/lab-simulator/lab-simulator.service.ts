import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { generateSyntheticResult } from "@klinika/domain";
import type { LabResultsWebhookRequest } from "@klinika/api-contracts";

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
  job: LabSimulatorScheduledJob;
}

// Domyślny tryb CLEAN/SUCCESS: 300 sekund do przewidywanego zakończenia realizacji.
const DEFAULT_ESTIMATED_COMPLETION_DELAY_MS = 300_000;

@Injectable()
export class LabSimulatorService {
  acceptOrder(input: LabSimulatorOrderInput): LabSimulatorOrderResult {
    const externalOrderId = `EXT-${randomUUID()}`;
    const delayMs = this.getDelayMs();
    const estimatedCompletionAt = new Date(Date.now() + delayMs);

    const results = input.tests.map((test) => ({
      medicalTestId: test.medicalTestId,
      parameters: test.parameters.map((parameter) =>
        generateSyntheticResult(
          `${input.orderId}:${test.medicalTestId}:${parameter.code}`,
          parameter
        )
      )
    }));

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
      job: {
        scenario: "SUCCESS",
        executeAt: estimatedCompletionAt,
        payload
      }
    };
  }

  private getDelayMs(): number {
    const configured = Number(process.env.LAB_SIMULATOR_DELAY_MS);
    return Number.isFinite(configured) && configured >= 0
      ? configured
      : DEFAULT_ESTIMATED_COMPLETION_DELAY_MS;
  }
}

