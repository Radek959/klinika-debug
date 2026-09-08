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

const PARTICIPANTS = Array.from({ length: 15 }, (_, i) => {
  const number = String(i + 1).padStart(2, "0");
  return { workspaceSlug: `warsztat-${number}`, userLogin: `tester${number}` };
});

const TEST_CATALOG = [
  { code: "MORF", materialType: "EDTA_BLOOD" },
  { code: "CRP", materialType: "SERUM" },
  { code: "TSH", materialType: "SERUM" },
  { code: "GLU", materialType: "SERUM" },
  { code: "URINE", materialType: "URINE" }
];

/**
 * production-like.log — większy, zaszumiony, ale logicznie spójny materiał
 * ze wszystkich workspace'ów warsztatowych: mieszanka udanych i nieudanych
 * procesów, walidacji, scenariuszy laboratorium (SUCCESS, RATE_LIMIT,
 * SERVER_ERROR, VALIDATION_ERROR) i regularnych tików schedulera, w jednym
 * dłuższym oknie czasowym. To NIE jest jeden zaprojektowany incydent do
 * rozwiązania — to ogólny materiał do ćwiczenia filtrowania i orientacji w
 * dużym zbiorze.
 */
module.exports = function generateProductionLike(shared) {
  const rng = shared.createRng(shared.SEED + 7);
  const clock = shared.createClock(rng, "2026-09-08T06:00:00.000Z");
  const buffer = shared.createBuffer();
  const ctx = { buffer, clock, rng };

  let orderCounter = 0;
  const nextOrderId = () => {
    orderCounter += 1;
    return `order-prod-${String(orderCounter).padStart(4, "0")}`;
  };

  shared.noiseBlock(buffer, clock, rng, 15);

  for (let round = 0; round < 13; round += 1) {
    const participant = rng.pick(PARTICIPANTS);
    const outcome = rng.pick([
      "success",
      "success",
      "success",
      "validation_error",
      "rate_limit",
      "server_error",
      "partial_success",
      "in_progress"
    ]);

    loginStep(shared, ctx, {
      workspaceSlug: participant.workspaceSlug,
      userLogin: participant.userLogin
    });
    shared.noiseBlock(buffer, clock, rng, rng.int(1, 4));

    if (outcome === "validation_error") {
      createPatientStep(shared, ctx, {
        workspaceSlug: participant.workspaceSlug,
        userLogin: participant.userLogin,
        status: 422,
        errorCode: "PATIENT_VALIDATION_ERROR",
        fieldErrors: [
          rng.pick([
            { field: "contact", code: "CONTACT_REQUIRED" },
            { field: "phone", code: "INVALID_PHONE" },
            { field: "guardian", code: "GUARDIAN_REQUIRED" },
            { field: "pesel", code: "INVALID_CHECKSUM" }
          ])
        ]
      });
      shared.noiseBlock(buffer, clock, rng, rng.int(2, 6));
      continue;
    }

    createPatientStep(shared, ctx, {
      workspaceSlug: participant.workspaceSlug,
      userLogin: participant.userLogin,
      patientId: `patient-prod-${round}`,
      status: 201
    });
    shared.noiseBlock(buffer, clock, rng, rng.int(1, 4));

    const testCount = rng.int(1, 2);
    const tests = [];
    const materials = new Set();
    for (let i = 0; i < testCount; i += 1) {
      const test = rng.pick(TEST_CATALOG);
      tests.push(test.code);
      materials.add(test.materialType);
    }
    const orderId = nextOrderId();

    createOrderStep(shared, ctx, {
      workspaceSlug: participant.workspaceSlug,
      userLogin: participant.userLogin,
      orderId,
      requiredMaterials: [...materials],
      testCodes: tests
    });
    shared.noiseBlock(buffer, clock, rng, rng.int(1, 4));

    const materialList = [...materials];
    for (let i = 0; i < materialList.length; i += 1) {
      const isLast = i === materialList.length - 1;
      registerSampleStep(shared, ctx, {
        workspaceSlug: participant.workspaceSlug,
        userLogin: participant.userLogin,
        orderId,
        materialType: materialList[i],
        previousStatus: i === 0 ? "DRAFT" : "SAMPLE_COLLECTION_IN_PROGRESS",
        newStatus: isLast ? "SAMPLE_COLLECTED" : "SAMPLE_COLLECTION_IN_PROGRESS"
      });
      shared.noiseBlock(buffer, clock, rng, rng.int(1, 3));
    }

    if (outcome === "in_progress") {
      // Zlecenie zostaje w toku — uczestnik jeszcze nie wysłał go do laboratorium.
      shared.noiseBlock(buffer, clock, rng, rng.int(3, 8));
      continue;
    }

    if (outcome === "server_error") {
      const first = sendOrderStep(shared, ctx, {
        workspaceSlug: participant.workspaceSlug,
        userLogin: participant.userLogin,
        orderId,
        status: 503,
        errorCode: "LAB_SERVER_ERROR"
      });
      retryScheduledStep(shared, ctx, {
        correlationId: first.correlationId,
        workspaceSlug: participant.workspaceSlug,
        orderId,
        attemptNumber: 1,
        retryAfterSeconds: 15
      });
      shared.noiseBlock(buffer, clock, rng, rng.int(4, 10));
      retryExecutedStep(shared, ctx, {
        correlationId: first.correlationId,
        workspaceSlug: participant.workspaceSlug,
        orderId,
        attemptNumber: 2,
        status: 200,
        gapMs: 15000
      });
      shared.noiseBlock(buffer, clock, rng, rng.int(2, 6));
      continue;
    }

    if (outcome === "rate_limit") {
      const first = sendOrderStep(shared, ctx, {
        workspaceSlug: participant.workspaceSlug,
        userLogin: participant.userLogin,
        orderId,
        status: 429,
        errorCode: "LAB_RATE_LIMITED"
      });
      retryScheduledStep(shared, ctx, {
        correlationId: first.correlationId,
        workspaceSlug: participant.workspaceSlug,
        orderId,
        attemptNumber: 1,
        retryAfterSeconds: 15
      });
      shared.noiseBlock(buffer, clock, rng, rng.int(3, 9));
      retryExecutedStep(shared, ctx, {
        correlationId: first.correlationId,
        workspaceSlug: participant.workspaceSlug,
        orderId,
        attemptNumber: 2,
        status: 200,
        gapMs: 15000
      });
      shared.noiseBlock(buffer, clock, rng, rng.int(2, 6));
      continue;
    }

    const send = sendOrderStep(shared, ctx, {
      workspaceSlug: participant.workspaceSlug,
      userLogin: participant.userLogin,
      orderId,
      status: 200
    });
    labAcceptStep(shared, ctx, {
      correlationId: send.correlationId,
      workspaceSlug: participant.workspaceSlug,
      orderId,
      externalOrderId: `EXT-${shared.uuidFrom(rng)}`,
      scenario: outcome === "partial_success" ? "PARTIAL_SUCCESS" : "SUCCESS"
    });
    shared.noiseBlock(buffer, clock, rng, rng.int(3, 9));

    if (outcome === "partial_success") {
      labCallbackStep(shared, ctx, {
        correlationId: send.correlationId,
        workspaceSlug: participant.workspaceSlug,
        orderId,
        newStatus: "PARTIAL",
        eventId: `evt-prod-${round}-partial`,
        eventType: "lab_result_partial"
      });
      shared.noiseBlock(buffer, clock, rng, rng.int(2, 6));
    }

    labCallbackStep(shared, ctx, {
      correlationId: send.correlationId,
      workspaceSlug: participant.workspaceSlug,
      orderId,
      newStatus: "COMPLETED",
      eventId: `evt-prod-${round}-final`
    });

    shared.noiseBlock(buffer, clock, rng, rng.int(2, 6));
  }

  // Regularne tiki schedulerów w tle, przez całe okno czasowe.
  for (let tick = 0; tick < 20; tick += 1) {
    buffer.push({
      timestamp: clock.tick(400, 1500),
      level: "DEBUG",
      correlationId: shared.randomCorrelationId(rng),
      event: rng.bool(0.5) ? "lab_jobs_poll_tick" : "lab_send_retry_poll_tick",
      component: rng.bool(0.5) ? "LabJobsScheduler" : "LabSendRetryScheduler",
      dueJobs: rng.int(0, 3)
    });
    if (rng.bool(0.3)) {
      shared.noiseBlock(buffer, clock, rng, rng.int(1, 3));
    }
  }

  shared.noiseBlock(buffer, clock, rng, 90);

  return shared.writeLog("production-like.log", buffer);
};
