import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  computeLabSendRetryExecuteAt,
  computePartialSuccessCallbackOffsets,
  computeRetryAfterSeconds,
  generateSyntheticResult,
  planLabOrderValidationRejection,
  planSampleRejection,
  splitMedicalTestIdsForPartialSuccess,
  FIRST_LAB_SEND_ATTEMPT_NUMBER,
  LAB_RATE_LIMITED_ERROR_CODE,
  LAB_RATE_LIMITED_MESSAGE,
  LAB_SERVER_ERROR_CODE,
  LAB_SERVER_ERROR_MESSAGE,
  type LabOrderValidationFieldError,
  type OrderMaterialType
} from "@klinika/domain";
import type { LabResultTestPayload, LabResultsWebhookRequest } from "@klinika/api-contracts";
import {
  resolveLabSimulatorScenario,
  type LabSimulatorScenario
} from "./lab-simulator-scenario";

export interface LabSimulatorParameterInput {
  code: string;
  valueType: "NUMERIC" | "TEXT";
  unit: string | null;
}

export interface LabSimulatorTestInput {
  medicalTestId: string;
  /** Kod badania z katalogu — używany do deterministycznego, stabilnego sortowania. */
  code: string;
  /** Rodzaj materiału wymaganego przez badanie — wiąże badanie z próbką. */
  materialType: OrderMaterialType;
  parameters: LabSimulatorParameterInput[];
}

/**
 * Minimalny opis próbki przekazywany do symulatora: identyfikator i rodzaj
 * materiału. Celowo nie przekazujemy tu danych pacjenta, kodu kreskowego ani
 * innych danych wrażliwych — symulator ich nie potrzebuje.
 */
export interface LabSimulatorSampleInput {
  sampleId: string;
  materialType: OrderMaterialType;
}

export interface LabSimulatorOrderInput {
  workspaceId: string;
  orderId: string;
  correlationId: string;
  tests: LabSimulatorTestInput[];
  samples: LabSimulatorSampleInput[];
  /**
   * Numer bieżącej próby wysyłki. Pierwsza, ręczna próba ma numer 1, pierwsze
   * automatyczne ponowienie — numer 2.
   *
   * Symulator NIE trzyma licznika prób w pamięci procesu: kontekst jest zawsze
   * przekazywany jawnie przez warstwę aplikacyjną, która odczytuje go z bazy.
   * Dzięki temu wynik jest deterministyczny również po restarcie aplikacji i
   * przy wielu instancjach schedulera.
   */
  attemptNumber?: number;
  /**
   * Scenariusz wymuszony przez wywołującego zamiast odczytu globalnej
   * konfiguracji.
   *
   * Używane przez automatyczne ponowienie: zadanie retry utrwala scenariusz w
   * chwili powstania, więc późniejsza zmiana `LAB_SIMULATOR_SCENARIO` nie może
   * zamienić trwającej operacji w inny scenariusz.
   */
  scenario?: LabSimulatorScenario;
}

export interface LabSimulatorScheduledJob {
  scenario: string;
  executeAt: Date;
  payload: LabResultsWebhookRequest;
}

/**
 * Zlecenie przyjęte przez laboratorium: powstaje identyfikator zewnętrzny,
 * przewidywany czas zakończenia i co najmniej jedno zadanie callbacka.
 */
export interface LabSimulatorOrderAccepted {
  accepted: true;
  externalOrderId: string;
  estimatedCompletionAt: Date;
  jobs: LabSimulatorScheduledJob[];
}

/**
 * Zlecenie odrzucone synchronicznie przez laboratorium.
 *
 * Wariant celowo nie zawiera `externalOrderId`, `estimatedCompletionAt` ani
 * `jobs` — nieprzyjęte zlecenie nie ma identyfikatora zewnętrznego, terminu
 * realizacji ani zaplanowanego callbacka. Odrzucenie jest zwracane jako wartość,
 * a nie wyjątek: symulator nie steruje przepływem aplikacji wyjątkami.
 */
export interface LabSimulatorOrderRejected {
  accepted: false;
  rejectionType: "VALIDATION";
  errorCode: "LAB_ORDER_VALIDATION_ERROR";
  message: string;
  fieldErrors: LabOrderValidationFieldError[];
}

/**
 * Zlecenie chwilowo nieprzyjęte z powodu ograniczenia przepustowości (HTTP 429).
 *
 * W odróżnieniu od odrzucenia walidacyjnego (`VALIDATION`) to NIE jest decyzja
 * ostateczna: żądanie ma zostać automatycznie ponowione po `retryAfterSeconds`.
 * Wariant celowo nie zawiera `externalOrderId`, `estimatedCompletionAt` ani
 * `jobs` — zlecenie nie zostało przyjęte. Ograniczenie jest zwracane jako
 * wartość, a nie wyjątek: przepływem nie steruje analiza treści wyjątku.
 */
export interface LabSimulatorOrderRateLimited {
  accepted: false;
  rejectionType: "RATE_LIMIT";
  statusCode: 429;
  errorCode: typeof LAB_RATE_LIMITED_ERROR_CODE;
  message: string;
  retryAfterSeconds: number;
  /** Moment, w którym wysyłka ma zostać automatycznie ponowiona. */
  nextRetryAt: Date;
  /** Numer próby, którą wykona automatyczne ponowienie. */
  nextAttemptNumber: number;
}

/**
 * Kontrolowany błąd `5xx` laboratorium przed przyjęciem zlecenia.
 *
 * Wariant nie zawiera `externalOrderId`, `estimatedCompletionAt` ani zadań
 * callbacka, bo laboratorium nie przyjęło zlecenia. Informacja o następnym
 * terminie jest obecna tylko wtedy, gdy harmonogram dopuszcza kolejne
 * automatyczne ponowienie.
 */
export interface LabSimulatorOrderServerError {
  accepted: false;
  rejectionType: "SERVER_ERROR";
  statusCode: 503;
  errorCode: typeof LAB_SERVER_ERROR_CODE;
  message: string;
  retryAfterSeconds: number | null;
  nextRetryAt: Date | null;
  nextAttemptNumber: number | null;
}

export type LabSimulatorOrderResult =
  | LabSimulatorOrderAccepted
  | LabSimulatorOrderRejected
  | LabSimulatorOrderRateLimited
  | LabSimulatorOrderServerError;

// Domyślny tryb CLEAN/SUCCESS: 300 sekund do przewidywanego zakończenia realizacji.
const DEFAULT_ESTIMATED_COMPLETION_DELAY_MS = 300_000;

@Injectable()
export class LabSimulatorService {
  acceptOrder(input: LabSimulatorOrderInput): LabSimulatorOrderResult {
    // Scenariusz przekazany jawnie ma pierwszeństwo przed globalną konfiguracją:
    // automatyczne ponowienie wykonuje ten scenariusz, dla którego powstało.
    const scenario = input.scenario ?? resolveLabSimulatorScenario();
    const attemptNumber = input.attemptNumber ?? FIRST_LAB_SEND_ATTEMPT_NUMBER;

    // Odrzucenie walidacyjne jest rozstrzygane przed wygenerowaniem
    // identyfikatora zewnętrznego: nieprzyjęte zlecenie nie może dostać
    // `externalOrderId` ani żadnego innego artefaktu przyjętej wysyłki.
    if (scenario === "VALIDATION_ERROR") {
      return this.buildValidationErrorResult(input);
    }

    // Ograniczenie przepustowości dotyczy WYŁĄCZNIE pierwszej próby. Druga
    // (automatyczne ponowienie) jest przyjmowana tak jak w scenariuszu SUCCESS,
    // więc przepływ 429 → ponowienie po 15 s → sukces jest deterministyczny i
    // niezależny od stanu pamięci procesu.
    if (scenario === "RATE_LIMIT" && attemptNumber === FIRST_LAB_SEND_ATTEMPT_NUMBER) {
      return this.buildRateLimitedResult(attemptNumber);
    }

    if (scenario === "SERVER_ERROR") {
      return this.buildServerErrorResult(attemptNumber);
    }

    const externalOrderId = `EXT-${randomUUID()}`;
    const delayMs = this.getDelayMs();

    if (scenario === "PARTIAL_SUCCESS" && input.tests.length >= 2) {
      return this.buildPartialSuccessResult(input, externalOrderId, delayMs);
    }

    if (scenario === "SAMPLE_REJECTED" && input.samples.length > 0) {
      return this.buildSampleRejectedResult(input, externalOrderId, delayMs);
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

  /**
   * Scenariusz VALIDATION_ERROR: laboratorium synchronicznie odrzuca zlecenie.
   *
   * Nie powstaje `externalOrderId`, `estimatedCompletionAt`, callback ani zadanie
   * do `lab_jobs`. Treść odrzucenia jest deterministyczna i syntetyczna — buduje
   * ją warstwa domenowa na podstawie samych kodów badań, bez danych pacjenta,
   * kodów kreskowych i nazwy aktywnego scenariusza.
   */
  private buildValidationErrorResult(
    input: LabSimulatorOrderInput
  ): LabSimulatorOrderRejected {
    const rejection = planLabOrderValidationRejection({
      testCodes: input.tests.map((test) => test.code)
    });

    return {
      accepted: false,
      rejectionType: rejection.rejectionType,
      errorCode: rejection.errorCode,
      message: rejection.message,
      fieldErrors: rejection.fieldErrors
    };
  }

  /**
   * Scenariusz RATE_LIMIT: laboratorium chwilowo ogranicza liczbę żądań.
   *
   * Termin ponowienia liczy współdzielona definicja harmonogramu z warstwy
   * domenowej (15/30/60 s), więc API i scheduler nie mogą się rozjechać.
   * Nie powstaje `externalOrderId`, `estimatedCompletionAt`, callback ani
   * zadanie `lab_jobs` — zlecenie nie zostało przyjęte.
   */
  private buildRateLimitedResult(attemptNumber: number): LabSimulatorOrderRateLimited {
    const now = new Date();
    const nextAttemptNumber = attemptNumber + 1;
    // Harmonogram gwarantuje termin dla drugiej próby, więc `nextRetryAt` nie
    // może tu być pusty. Asercja jest jawna, żeby ewentualna zmiana
    // harmonogramu w przyszłości nie przeszła po cichu.
    const nextRetryAt = computeLabSendRetryExecuteAt({
      now,
      attemptNumber: nextAttemptNumber
    });
    if (!nextRetryAt) {
      throw new Error(
        `Harmonogram ponowień nie definiuje terminu dla próby ${nextAttemptNumber}.`
      );
    }

    return {
      accepted: false,
      rejectionType: "RATE_LIMIT",
      statusCode: 429,
      errorCode: LAB_RATE_LIMITED_ERROR_CODE,
      message: LAB_RATE_LIMITED_MESSAGE,
      retryAfterSeconds: computeRetryAfterSeconds({ now, executeAt: nextRetryAt }),
      nextRetryAt,
      nextAttemptNumber
    };
  }

  private buildServerErrorResult(attemptNumber: number): LabSimulatorOrderServerError {
    const now = new Date();
    const nextAttemptNumber = attemptNumber + 1;
    const nextRetryAt = computeLabSendRetryExecuteAt({
      now,
      attemptNumber: nextAttemptNumber
    });

    return {
      accepted: false,
      rejectionType: "SERVER_ERROR",
      statusCode: 503,
      errorCode: LAB_SERVER_ERROR_CODE,
      message: LAB_SERVER_ERROR_MESSAGE,
      retryAfterSeconds: nextRetryAt
        ? computeRetryAfterSeconds({ now, executeAt: nextRetryAt })
        : null,
      nextRetryAt,
      nextAttemptNumber: nextRetryAt ? nextAttemptNumber : null
    };
  }

  private buildSuccessResult(
    input: LabSimulatorOrderInput,
    externalOrderId: string,
    delayMs: number
  ): LabSimulatorOrderAccepted {
    const estimatedCompletionAt = new Date(Date.now() + delayMs);
    const results = input.tests.map((test) => this.buildTestResultPayload(input.orderId, test));

    const payload: LabResultsWebhookRequest = {
      externalOrderId,
      eventId: randomUUID(),
      correlationId: input.correlationId,
      status: "COMPLETED",
      results,
      pendingMedicalTestIds: []
    };

    return {
      accepted: true,
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
  ): LabSimulatorOrderAccepted {
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
      correlationId: input.correlationId,
      status: "PARTIAL",
      results: firstResults,
      pendingMedicalTestIds: secondBatchTestIds
    };

    const completionPayload: LabResultsWebhookRequest = {
      externalOrderId,
      eventId: randomUUID(),
      correlationId: input.correlationId,
      status: "COMPLETED",
      results: secondResults,
      pendingMedicalTestIds: []
    };

    return {
      accepted: true,
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

  /**
   * Scenariusz SAMPLE_REJECTED: laboratorium odrzuca dokładnie jedną próbkę.
   *
   * Wybór próbki jest deterministyczny (bez losowania), a wyniki powstają
   * wyłącznie dla badań wykonanych z nieodrzuconych materiałów. Powstaje
   * dokładnie jeden końcowy callback o statusie REJECTED — zarówno dla
   * zlecenia z jedną próbką, jak i z wieloma.
   */
  private buildSampleRejectedResult(
    input: LabSimulatorOrderInput,
    externalOrderId: string,
    delayMs: number
  ): LabSimulatorOrderAccepted {
    const estimatedCompletionAt = new Date(Date.now() + delayMs);
    const testsById = new Map(input.tests.map((test) => [test.medicalTestId, test]));
    const plan = planSampleRejection({
      samples: input.samples,
      tests: input.tests.map((test) => ({
        medicalTestId: test.medicalTestId,
        materialType: test.materialType
      }))
    });

    const results = plan.completedMedicalTestIds.map((medicalTestId) =>
      this.buildTestResultPayload(input.orderId, testsById.get(medicalTestId)!)
    );

    const payload: LabResultsWebhookRequest = {
      externalOrderId,
      eventId: randomUUID(),
      correlationId: input.correlationId,
      status: "REJECTED",
      results,
      // Callback REJECTED jest terminalny: żadne badanie nie zostaje w oczekiwaniu.
      pendingMedicalTestIds: [],
      rejectedSamples: [
        {
          sampleId: plan.rejectedSampleId,
          rejectionCode: plan.rejectionCode,
          rejectionReason: plan.rejectionReason
        }
      ]
    };

    return {
      accepted: true,
      externalOrderId,
      estimatedCompletionAt,
      jobs: [
        {
          scenario: "SAMPLE_REJECTED",
          executeAt: estimatedCompletionAt,
          payload
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
