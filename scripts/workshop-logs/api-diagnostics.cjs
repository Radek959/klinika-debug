"use strict";

const {
  loginStep,
  createOrderStep,
  registerSampleStep,
  sendOrderStep,
  labAcceptStep
} = require("./narrative.cjs");

/**
 * api-diagnostics.log — incydent wymagający połączenia UI/DevTools/API i
 * correlationId. Zlecenia z badaniem CRP wysyłają się normalnie; zlecenia z
 * badaniem TSH konsekwentnie kończą się HTTP 500 PRZED jakąkolwiek
 * odpowiedzią laboratorium (bardzo krótki czas wykonania — krótszy niż
 * jakakolwiek realna odpowiedź integracji). Log NIE nazywa przyczyny wprost
 * (żadnego literalnego "API_DIAGNOSTICS"), zawiera realny symptom, wcześniejsze
 * poszlaki, jedną spójną alternatywną hipotezę (kandydat: chwilowe problemy
 * łączności laboratorium) i jeden niezwiązany błąd ERROR w tym samym oknie
 * czasowym.
 */
module.exports = function generateApiDiagnostics(shared) {
  const rng = shared.createRng(shared.SEED + 5);
  const clock = shared.createClock(rng, "2026-09-08T13:05:10.998Z");
  const buffer = shared.createBuffer();
  const ctx = { buffer, clock, rng };

  const workspaceSlug = "warsztat-08";
  const userLogin = "tester08";

  shared.noiseBlock(buffer, clock, rng, 10);
  loginStep(shared, ctx, { workspaceSlug, userLogin });
  shared.noiseBlock(buffer, clock, rng, 4);

  // Zlecenie referencyjne z CRP — wysyła się i kończy normalnie (kontrast dla
  // czasu trwania i zachowania w dalszej części pliku).
  const crpOrderId = "order-diag-crp-0001";
  createOrderStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    orderId: crpOrderId,
    requiredMaterials: ["SERUM"],
    testCodes: ["CRP"]
  });
  registerSampleStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    orderId: crpOrderId,
    materialType: "SERUM",
    previousStatus: "DRAFT",
    newStatus: "SAMPLE_COLLECTED"
  });
  const crpSend = sendOrderStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    orderId: crpOrderId,
    status: 200,
    durationMs: rng.int(140, 260)
  });
  labAcceptStep(shared, ctx, {
    correlationId: crpSend.correlationId,
    workspaceSlug,
    orderId: crpOrderId,
    externalOrderId: "EXT-1c4d7f22-9e3b-4a11-8c05-2f6a9b7d0e44",
    scenario: "SUCCESS"
  });

  shared.noiseBlock(buffer, clock, rng, 14);

  // Alternatywna hipoteza: w tym samym oknie czasu widać ostrzeżenie o
  // podwyższonym opóźnieniu integracji dla INNEGO zlecenia — wygląda na
  // wiarygodny trop "problemy z łącznością laboratorium", ale dotyczy innego
  // zlecenia i innego correlationId.
  buffer.push({
    timestamp: clock.tick(300, 900),
    level: "WARN",
    correlationId: shared.randomCorrelationId(rng),
    event: "lab_simulator_latency_high",
    component: "LabSimulatorService",
    workspaceSlug: "warsztat-11",
    orderId: "order-unrelated-latency-0007",
    observedLatencyMs: rng.int(1800, 2600)
  });

  shared.noiseBlock(buffer, clock, rng, 10);

  // Niezwiązany błąd ERROR w tym samym oknie czasowym — nie jest przyczyną
  // incydentu TSH.
  buffer.push({
    timestamp: clock.tick(200, 700),
    level: "ERROR",
    correlationId: shared.randomCorrelationId(rng),
    event: "duplicate_barcode_rejected",
    component: "OrdersService",
    workspaceSlug: "warsztat-03",
    errorCode: "DUPLICATE_BARCODE",
    message: "Odrzucono rejestrację próbki: kod kreskowy już istnieje w tym workspace."
  });

  shared.noiseBlock(buffer, clock, rng, 10);

  // Pierwsza próba z badaniem TSH: 500 PRZED wywołaniem laboratorium.
  const tshOrderId1 = "order-diag-tsh-0001";
  createOrderStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    orderId: tshOrderId1,
    requiredMaterials: ["SERUM"],
    testCodes: ["TSH"]
  });
  registerSampleStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    orderId: tshOrderId1,
    materialType: "SERUM",
    previousStatus: "DRAFT",
    newStatus: "SAMPLE_COLLECTED"
  });
  const tshSend1 = sendOrderStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    orderId: tshOrderId1,
    status: 500,
    errorCode: "INTERNAL_SERVER_ERROR",
    // Bardzo krótki czas wykonania — zauważalnie krótszy niż realna odpowiedź
    // laboratorium (patrz zlecenie CRP powyżej: 140-260 ms).
    durationMs: rng.int(4, 14)
  });
  buffer.push({
    timestamp: clock.now(),
    level: "ERROR",
    correlationId: tshSend1.correlationId,
    event: "unhandled_exception_response_sent",
    component: "ApiExceptionFilter",
    workspaceSlug,
    orderId: tshOrderId1,
    statusCode: 500
  });

  shared.noiseBlock(buffer, clock, rng, 18);

  // Uczestnik próbuje ponownie ręcznie (nowe żądanie, ten sam wzorzec).
  const tshSendRetry = sendOrderStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    orderId: tshOrderId1,
    status: 500,
    errorCode: "INTERNAL_SERVER_ERROR",
    durationMs: rng.int(4, 14)
  });
  buffer.push({
    timestamp: clock.now(),
    level: "ERROR",
    correlationId: tshSendRetry.correlationId,
    event: "unhandled_exception_response_sent",
    component: "ApiExceptionFilter",
    workspaceSlug,
    orderId: tshOrderId1,
    statusCode: 500
  });

  shared.noiseBlock(buffer, clock, rng, 20);

  // Druga, niezależna próba z INNYM zleceniem TSH — ten sam wzorzec, inny
  // correlationId, ten sam bardzo krótki czas trwania.
  const tshOrderId2 = "order-diag-tsh-0002";
  createOrderStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    orderId: tshOrderId2,
    requiredMaterials: ["SERUM"],
    testCodes: ["TSH"]
  });
  registerSampleStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    orderId: tshOrderId2,
    materialType: "SERUM",
    previousStatus: "DRAFT",
    newStatus: "SAMPLE_COLLECTED"
  });
  const tshSend2 = sendOrderStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    orderId: tshOrderId2,
    status: 500,
    errorCode: "INTERNAL_SERVER_ERROR",
    durationMs: rng.int(4, 14)
  });
  buffer.push({
    timestamp: clock.now(),
    level: "ERROR",
    correlationId: tshSend2.correlationId,
    event: "unhandled_exception_response_sent",
    component: "ApiExceptionFilter",
    workspaceSlug,
    orderId: tshOrderId2,
    statusCode: 500
  });

  shared.noiseBlock(buffer, clock, rng, 60);

  return shared.writeLog("api-diagnostics.log", buffer);
};
