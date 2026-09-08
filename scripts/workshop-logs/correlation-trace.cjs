"use strict";

const {
  loginStep,
  createPatientStep,
  createOrderStep,
  registerSampleStep,
  sendOrderStep,
  labAcceptStep,
  labCallbackStep,
  retryScheduledStep,
  retryExecutedStep
} = require("./narrative.cjs");

/**
 * correlation-trace.log — kilka współbieżnych, przeplecionych procesów z
 * różnymi correlationId. Ćwiczenie: odtworzyć jeden konkretny proces
 * (pełną ścieżkę pacjent → zlecenie → próbki → wysyłka → laboratorium →
 * wynik dla workspace'u warsztat-02), filtrując po correlationId, wśród
 * całkowicie niezwiązanych requestów innych uczestników w tym samym oknie
 * czasowym.
 */
module.exports = function generateCorrelationTrace(shared) {
  const rng = shared.createRng(shared.SEED + 6);
  const clock = shared.createClock(rng, "2026-09-08T14:20:00.000Z");
  const buffer = shared.createBuffer();
  const ctx = { buffer, clock, rng };

  // --- Proces docelowy (A): pełna ścieżka do odtworzenia. ---
  const flowA = { workspaceSlug: "warsztat-02", userLogin: "tester02", orderId: "order-trace-a-0001" };
  const stepsA = [];
  stepsA.push(() => loginStep(shared, ctx, { workspaceSlug: flowA.workspaceSlug, userLogin: flowA.userLogin }));
  stepsA.push(() =>
    createPatientStep(shared, ctx, {
      workspaceSlug: flowA.workspaceSlug,
      userLogin: flowA.userLogin,
      patientId: "patient-trace-a-0001",
      status: 201
    })
  );
  stepsA.push(() =>
    createOrderStep(shared, ctx, {
      workspaceSlug: flowA.workspaceSlug,
      userLogin: flowA.userLogin,
      orderId: flowA.orderId,
      requiredMaterials: ["EDTA_BLOOD", "SERUM"],
      testCodes: ["MORF", "CRP"]
    })
  );
  stepsA.push(() =>
    registerSampleStep(shared, ctx, {
      workspaceSlug: flowA.workspaceSlug,
      userLogin: flowA.userLogin,
      orderId: flowA.orderId,
      materialType: "EDTA_BLOOD",
      previousStatus: "DRAFT",
      newStatus: "SAMPLE_COLLECTION_IN_PROGRESS"
    })
  );
  stepsA.push(() =>
    registerSampleStep(shared, ctx, {
      workspaceSlug: flowA.workspaceSlug,
      userLogin: flowA.userLogin,
      orderId: flowA.orderId,
      materialType: "SERUM",
      previousStatus: "SAMPLE_COLLECTION_IN_PROGRESS",
      newStatus: "SAMPLE_COLLECTED"
    })
  );
  let flowASendCorrelationId = null;
  stepsA.push(() => {
    const result = sendOrderStep(shared, ctx, {
      workspaceSlug: flowA.workspaceSlug,
      userLogin: flowA.userLogin,
      orderId: flowA.orderId,
      status: 200
    });
    flowASendCorrelationId = result.correlationId;
  });
  stepsA.push(() =>
    labAcceptStep(shared, ctx, {
      correlationId: flowASendCorrelationId,
      workspaceSlug: flowA.workspaceSlug,
      orderId: flowA.orderId,
      externalOrderId: "EXT-9b1e4c33-6a0d-4e7f-8b2a-5d3c1f9e7a02",
      scenario: "SUCCESS"
    })
  );
  stepsA.push(() =>
    labCallbackStep(shared, ctx, {
      correlationId: flowASendCorrelationId,
      workspaceSlug: flowA.workspaceSlug,
      orderId: flowA.orderId,
      newStatus: "COMPLETED",
      eventId: "evt-trace-a-0001"
    })
  );

  // --- Proces B: nieudane logowanie, potem udane — inny uczestnik. ---
  const stepsB = [];
  stepsB.push(() => loginStep(shared, ctx, { workspaceSlug: "warsztat-04", userLogin: "tester04", success: false }));
  stepsB.push(() => loginStep(shared, ctx, { workspaceSlug: "warsztat-04", userLogin: "tester04", success: true }));
  stepsB.push(() =>
    createPatientStep(shared, ctx, {
      workspaceSlug: "warsztat-04",
      userLogin: "tester04",
      patientId: "patient-trace-b-0001",
      status: 201
    })
  );

  // --- Proces C: rejestracja zlecenia i próbek, bez wysyłki (jeszcze w toku). ---
  const stepsC = [];
  const flowC = { workspaceSlug: "warsztat-10", userLogin: "tester10", orderId: "order-trace-c-0001" };
  stepsC.push(() => loginStep(shared, ctx, { workspaceSlug: flowC.workspaceSlug, userLogin: flowC.userLogin }));
  stepsC.push(() =>
    createOrderStep(shared, ctx, {
      workspaceSlug: flowC.workspaceSlug,
      userLogin: flowC.userLogin,
      orderId: flowC.orderId,
      requiredMaterials: ["URINE"],
      testCodes: ["URINE"]
    })
  );
  stepsC.push(() =>
    registerSampleStep(shared, ctx, {
      workspaceSlug: flowC.workspaceSlug,
      userLogin: flowC.userLogin,
      orderId: flowC.orderId,
      materialType: "URINE",
      previousStatus: "DRAFT",
      newStatus: "SAMPLE_COLLECTED"
    })
  );

  // --- Proces D: wysyłka trafia na RATE_LIMIT, jedno automatyczne ponowienie. ---
  const stepsD = [];
  const flowD = { workspaceSlug: "warsztat-13", userLogin: "tester13", orderId: "order-trace-d-0001" };
  let flowDCorrelationId = null;
  stepsD.push(() => loginStep(shared, ctx, { workspaceSlug: flowD.workspaceSlug, userLogin: flowD.userLogin }));
  stepsD.push(() =>
    createOrderStep(shared, ctx, {
      workspaceSlug: flowD.workspaceSlug,
      userLogin: flowD.userLogin,
      orderId: flowD.orderId,
      requiredMaterials: ["SERUM"],
      testCodes: ["GLU"]
    })
  );
  stepsD.push(() =>
    registerSampleStep(shared, ctx, {
      workspaceSlug: flowD.workspaceSlug,
      userLogin: flowD.userLogin,
      orderId: flowD.orderId,
      materialType: "SERUM",
      previousStatus: "DRAFT",
      newStatus: "SAMPLE_COLLECTED"
    })
  );
  stepsD.push(() => {
    const result = sendOrderStep(shared, ctx, {
      workspaceSlug: flowD.workspaceSlug,
      userLogin: flowD.userLogin,
      orderId: flowD.orderId,
      status: 429,
      errorCode: "LAB_RATE_LIMITED"
    });
    flowDCorrelationId = result.correlationId;
    retryScheduledStep(shared, ctx, {
      correlationId: flowDCorrelationId,
      workspaceSlug: flowD.workspaceSlug,
      orderId: flowD.orderId,
      attemptNumber: 1,
      retryAfterSeconds: 15
    });
  });
  stepsD.push(() =>
    retryExecutedStep(shared, ctx, {
      correlationId: flowDCorrelationId,
      workspaceSlug: flowD.workspaceSlug,
      orderId: flowD.orderId,
      attemptNumber: 2,
      status: 200,
      gapMs: 15000
    })
  );

  // --- Przeplot: naprzemienne kroki A/B/C/D z szumem między rundami. ---
  const queues = [stepsA, stepsB, stepsC, stepsD];
  let remaining = queues.reduce((sum, queue) => sum + queue.length, 0);
  const cursors = [0, 0, 0, 0];
  let guard = 0;
  while (remaining > 0 && guard < 500) {
    guard += 1;
    for (let i = 0; i < queues.length; i += 1) {
      if (cursors[i] < queues[i].length) {
        queues[i][cursors[i]]();
        cursors[i] += 1;
        remaining -= 1;
        shared.noiseBlock(buffer, clock, rng, rng.int(2, 4));
      }
    }
  }

  shared.noiseBlock(buffer, clock, rng, 110);

  return shared.writeLog("correlation-trace.log", buffer);
};
