"use strict";

const {
  loginStep,
  createOrderStep,
  registerSampleStep,
  sendOrderStep
} = require("./narrative.cjs");

/**
 * order-flow.log — niespójność w procesie zlecenia i próbek. Zlecenie wymaga
 * dwóch różnych materiałów (EDTA_BLOOD + SERUM). Po zarejestrowaniu TYLKO
 * pierwszej z nich status zlecenia pokazuje SAMPLE_COLLECTED, mimo że druga
 * próbka pozostaje REQUIRED — a kolejna próba zarejestrowania drugiej próbki
 * kończy się błędem, bo zlecenie nie jest już w stanie edytowalnym. Log nie
 * nazywa przyczyny wprost — pokazuje tylko obserwowalne żądania i statusy.
 */
module.exports = function generateOrderFlow(shared) {
  const rng = shared.createRng(shared.SEED + 3);
  const clock = shared.createClock(rng, "2026-09-08T10:04:55.207Z");
  const buffer = shared.createBuffer();
  const ctx = { buffer, clock, rng };

  const workspaceSlug = "warsztat-06";
  const userLogin = "tester06";
  const orderId = "order-flow-0001";

  shared.noiseBlock(buffer, clock, rng, 9);
  loginStep(shared, ctx, { workspaceSlug, userLogin });
  shared.noiseBlock(buffer, clock, rng, 5);

  createOrderStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    orderId,
    requiredMaterials: ["EDTA_BLOOD", "SERUM"]
  });
  shared.noiseBlock(buffer, clock, rng, 6);

  // Rejestracja PIERWSZEJ z dwóch wymaganych próbek.
  registerSampleStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    orderId,
    materialType: "SERUM",
    previousStatus: "DRAFT",
    // Obserwowalna niespójność: zlecenie od razu SAMPLE_COLLECTED, mimo że
    // materiał EDTA_BLOOD nie został jeszcze zarejestrowany.
    newStatus: "SAMPLE_COLLECTED"
  });

  buffer.push({
    timestamp: clock.tick(10, 30),
    level: "DEBUG",
    correlationId: shared.randomCorrelationId(rng),
    event: "order_status_persisted",
    component: "OrdersService",
    workspaceSlug,
    orderId,
    status: "SAMPLE_COLLECTED",
    samples: [
      { materialType: "SERUM", status: "COLLECTED" },
      { materialType: "EDTA_BLOOD", status: "REQUIRED" }
    ]
  });

  shared.noiseBlock(buffer, clock, rng, 8);

  // Uczestnik próbuje zarejestrować drugą próbkę (EDTA_BLOOD) — zlecenie nie
  // jest już w stanie edytowalnym.
  registerSampleStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    orderId,
    materialType: "EDTA_BLOOD",
    status: 422,
    errorCode: "SAMPLE_REGISTRATION_ERROR",
    previousStatus: "SAMPLE_COLLECTED",
    newStatus: "SAMPLE_COLLECTED"
  });
  buffer.push({
    timestamp: clock.tick(5, 20),
    level: "WARN",
    correlationId: shared.randomCorrelationId(rng),
    event: "sample_registration_field_errors",
    component: "OrdersService",
    workspaceSlug,
    orderId,
    fieldErrors: [{ field: "status", code: "ORDER_NOT_EDITABLE" }]
  });

  shared.noiseBlock(buffer, clock, rng, 10);

  // Uczestnik mimo to wysyła zlecenie do laboratorium — wysyłka się udaje,
  // bo status zlecenia formalnie na to pozwala.
  const { correlationId: sendCorrelationId } = sendOrderStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    orderId,
    status: 200
  });
  buffer.push({
    timestamp: clock.tick(5, 25),
    level: "INFO",
    correlationId: sendCorrelationId,
    event: "lab_order_accepted",
    component: "LabSimulatorService",
    workspaceSlug,
    orderId,
    externalOrderId: "EXT-3a7c9e11-2b5d-4f80-9c66-71a4e0d9b512",
    scenario: "SUCCESS"
  });

  shared.noiseBlock(buffer, clock, rng, 6);

  // Historia zlecenia pokazuje obie próbki — jedna nigdy nie została
  // faktycznie zarejestrowana, mimo że zlecenie zostało wysłane.
  buffer.push(
    shared.httpEntry(clock, rng, {
      correlationId: shared.randomCorrelationId(rng),
      method: "GET",
      path: "/api/v1/orders/{orderId}/history",
      status: 200,
      component: "OrderHistoryController",
      workspaceSlug,
      userLogin,
      durationMs: rng.int(20, 60)
    })
  );

  shared.noiseBlock(buffer, clock, rng, 70);

  return shared.writeLog("order-flow.log", buffer);
};
