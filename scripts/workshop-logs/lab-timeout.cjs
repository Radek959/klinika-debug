"use strict";

const {
  loginStep,
  createOrderStep,
  registerSampleStep,
  sendOrderStep,
  retryScheduledStep,
  retryExecutedStep
} = require("./narrative.cjs");

/**
 * lab-timeout.log — pełna chronologia scenariusza TIMEOUT: wysyłka → 504 →
 * ponowienie po 15 s → 504 → ponowienie po 30 s → 504 → ponowienie po 60 s →
 * 504 → wyczerpanie prób → TECHNICAL_ERROR, zgodnie z rzeczywistym
 * harmonogramem retry Kliniki Debug (`LAB_SEND_RETRY_DELAYS_SECONDS`), plus
 * szum niezwiązany z tym zleceniem.
 */
module.exports = function generateLabTimeout(shared) {
  const rng = shared.createRng(shared.SEED + 4);
  const clock = shared.createClock(rng, "2026-09-08T11:30:00.512Z");
  const buffer = shared.createBuffer();
  const ctx = { buffer, clock, rng };

  const workspaceSlug = "warsztat-12";
  const userLogin = "tester12";
  const orderId = "order-timeout-0001";

  shared.noiseBlock(buffer, clock, rng, 10);
  loginStep(shared, ctx, { workspaceSlug, userLogin });
  shared.noiseBlock(buffer, clock, rng, 6);

  createOrderStep(shared, ctx, { workspaceSlug, userLogin, orderId, requiredMaterials: ["SERUM"] });
  shared.noiseBlock(buffer, clock, rng, 5);

  registerSampleStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    orderId,
    materialType: "SERUM",
    previousStatus: "DRAFT",
    newStatus: "SAMPLE_COLLECTED"
  });
  shared.noiseBlock(buffer, clock, rng, 8);

  // Próba 1: timeout.
  const { correlationId } = sendOrderStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    orderId,
    status: 504,
    errorCode: "LAB_SEND_TIMEOUT",
    durationMs: rng.int(4800, 5200)
  });
  buffer.push({
    timestamp: clock.now(),
    level: "ERROR",
    correlationId,
    event: "lab_send_timeout_received",
    component: "LabSimulatorService",
    workspaceSlug,
    orderId,
    attemptNumber: 1
  });
  retryScheduledStep(shared, ctx, {
    correlationId,
    workspaceSlug,
    orderId,
    attemptNumber: 1,
    retryAfterSeconds: 15
  });

  shared.noiseBlock(buffer, clock, rng, 20);

  // Próba 2 (po 15 s): ponownie timeout.
  retryExecutedStep(shared, ctx, {
    correlationId,
    workspaceSlug,
    orderId,
    attemptNumber: 2,
    status: 504,
    errorCode: "LAB_SEND_TIMEOUT",
    gapMs: 15000
  });
  retryScheduledStep(shared, ctx, {
    correlationId,
    workspaceSlug,
    orderId,
    attemptNumber: 2,
    retryAfterSeconds: 30
  });

  shared.noiseBlock(buffer, clock, rng, 24);

  // Próba 3 (po 30 s): ponownie timeout.
  retryExecutedStep(shared, ctx, {
    correlationId,
    workspaceSlug,
    orderId,
    attemptNumber: 3,
    status: 504,
    errorCode: "LAB_SEND_TIMEOUT",
    gapMs: 30000
  });
  retryScheduledStep(shared, ctx, {
    correlationId,
    workspaceSlug,
    orderId,
    attemptNumber: 3,
    retryAfterSeconds: 60
  });

  shared.noiseBlock(buffer, clock, rng, 30);

  // Próba 4 (po 60 s): ostatnia dozwolona próba, znowu timeout -> wyczerpanie.
  retryExecutedStep(shared, ctx, {
    correlationId,
    workspaceSlug,
    orderId,
    attemptNumber: 4,
    status: 504,
    errorCode: "LAB_SEND_TIMEOUT",
    gapMs: 60000
  });
  buffer.push({
    timestamp: clock.tick(15, 40),
    level: "ERROR",
    correlationId,
    event: "lab_send_retry_exhausted",
    component: "LabSendRetryService",
    workspaceSlug,
    orderId,
    attemptNumber: 4,
    maxAttempts: 4
  });
  buffer.push({
    timestamp: clock.now(),
    level: "ERROR",
    correlationId,
    event: "order_technical_error",
    component: "OrdersService",
    workspaceSlug,
    orderId,
    previousStatus: "SAMPLE_COLLECTED",
    newStatus: "TECHNICAL_ERROR"
  });

  shared.noiseBlock(buffer, clock, rng, 55);

  return shared.writeLog("lab-timeout.log", buffer);
};
