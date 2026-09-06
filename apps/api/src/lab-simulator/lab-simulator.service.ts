import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

export interface LabSimulatorOrderInput {
  workspaceId: string;
  orderId: string;
}

export interface LabSimulatorOrderResult {
  externalOrderId: string;
  estimatedCompletionAt: Date;
}

// Domyślny tryb CLEAN/SUCCESS: 300 sekund do przewidywanego zakończenia realizacji.
const DEFAULT_ESTIMATED_COMPLETION_DELAY_MS = 300_000;

@Injectable()
export class LabSimulatorService {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- input reserved for future scenario/error-package support
  acceptOrder(input: LabSimulatorOrderInput): LabSimulatorOrderResult {
    return {
      externalOrderId: `EXT-${randomUUID()}`,
      estimatedCompletionAt: new Date(
        Date.now() + DEFAULT_ESTIMATED_COMPLETION_DELAY_MS
      )
    };
  }
}
