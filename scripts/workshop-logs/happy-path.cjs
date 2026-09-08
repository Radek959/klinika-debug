"use strict";

const {
  loginStep,
  createPatientStep,
  createOrderStep,
  registerSampleStep,
  sendOrderStep,
  labAcceptStep,
  labCallbackStep
} = require("./narrative.cjs");

/**
 * happy-path.log — pełny, poprawny proces: logowanie → pacjent → zlecenie →
 * próbka → wysyłka → laboratorium → callback → COMPLETED, jako punkt
 * odniesienia, plus szum niezwiązany z tym procesem.
 */
module.exports = function generateHappyPath(shared) {
  const rng = shared.createRng(shared.SEED + 1);
  const clock = shared.createClock(rng, "2026-09-08T07:58:12.104Z");
  const buffer = shared.createBuffer();
  const ctx = { buffer, clock, rng };

  const workspaceSlug = "warsztat-05";
  const userLogin = "tester05";
  const orderId = "order-happy-0001";
  const patientId = "patient-happy-0001";
  const externalOrderId = "EXT-8f2b6b7e-8c9a-4e63-93a1-0a1c8e2f7d10";

  shared.noiseBlock(buffer, clock, rng, 8);

  loginStep(shared, ctx, { workspaceSlug, userLogin });
  shared.noiseBlock(buffer, clock, rng, 3);

  createPatientStep(shared, ctx, { workspaceSlug, userLogin, patientId, status: 201 });
  shared.noiseBlock(buffer, clock, rng, 4);

  createOrderStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    orderId,
    requiredMaterials: ["SERUM"]
  });
  shared.noiseBlock(buffer, clock, rng, 3);

  registerSampleStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    orderId,
    materialType: "SERUM",
    previousStatus: "DRAFT",
    newStatus: "SAMPLE_COLLECTED"
  });
  shared.noiseBlock(buffer, clock, rng, 5);

  const { correlationId: sendCorrelationId } = sendOrderStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    orderId,
    status: 200
  });

  labAcceptStep(shared, ctx, {
    correlationId: sendCorrelationId,
    workspaceSlug,
    orderId,
    externalOrderId,
    scenario: "SUCCESS",
    executeInSeconds: 5
  });

  shared.noiseBlock(buffer, clock, rng, 12);

  labCallbackStep(shared, ctx, {
    correlationId: sendCorrelationId,
    workspaceSlug,
    orderId,
    newStatus: "COMPLETED",
    eventId: "evt-happy-0001"
  });

  buffer.push(
    shared.httpEntry(clock, rng, {
      correlationId: shared.randomCorrelationId(rng),
      method: "GET",
      path: "/api/v1/orders/{orderId}",
      status: 200,
      component: "OrdersController",
      workspaceSlug,
      userLogin,
      durationMs: rng.int(20, 70)
    })
  );

  shared.noiseBlock(buffer, clock, rng, 45);

  return shared.writeLog("happy-path.log", buffer);
};
