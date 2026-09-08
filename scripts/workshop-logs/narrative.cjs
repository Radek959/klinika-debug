"use strict";

/**
 * Wspólne "kroki" narracji używane przez kilka scenariuszy logów
 * (happy-path, patient-error, order-flow, api-diagnostics,
 * correlation-trace). Każdy krok dopisuje jedną albo więcej linii JSONL do
 * bufora i zwraca dane potrzebne kolejnym krokom (np. correlationId, id
 * zlecenia).
 */

function loginStep(shared, ctx, opts) {
  const { buffer, clock, rng } = ctx;
  const correlationId = shared.randomCorrelationId(rng);
  const success = opts.success !== false;
  buffer.push(
    shared.httpEntry(clock, rng, {
      correlationId,
      method: "POST",
      path: "/api/v1/auth/login",
      status: success ? 200 : 401,
      component: "AuthController",
      workspaceSlug: opts.workspaceSlug,
      userLogin: opts.userLogin,
      errorCode: success ? undefined : "INVALID_CREDENTIALS",
      durationMs: rng.int(30, 90)
    })
  );
  return { correlationId };
}

function createPatientStep(shared, ctx, opts) {
  const { buffer, clock, rng } = ctx;
  const correlationId = shared.randomCorrelationId(rng);
  buffer.push({
    timestamp: clock.tick(20, 60),
    level: "DEBUG",
    correlationId,
    event: "patient_validation_started",
    component: "PatientsService",
    workspaceSlug: opts.workspaceSlug
  });
  const status = opts.status || 201;
  buffer.push(
    shared.httpEntry(clock, rng, {
      correlationId,
      method: "POST",
      path: "/api/v1/patients",
      status,
      component: "PatientsController",
      workspaceSlug: opts.workspaceSlug,
      userLogin: opts.userLogin,
      errorCode: opts.errorCode,
      durationMs: rng.int(25, 110)
    })
  );
  if (opts.fieldErrors && opts.fieldErrors.length) {
    buffer.push({
      timestamp: clock.now(),
      level: "WARN",
      correlationId,
      event: "patient_validation_rejected",
      component: "PatientsService",
      workspaceSlug: opts.workspaceSlug,
      fieldErrors: opts.fieldErrors
    });
  }
  return { correlationId, patientId: opts.patientId };
}

function createOrderStep(shared, ctx, opts) {
  const { buffer, clock, rng } = ctx;
  const correlationId = shared.randomCorrelationId(rng);
  buffer.push(
    shared.httpEntry(clock, rng, {
      correlationId,
      method: "POST",
      path: "/api/v1/orders",
      status: 201,
      component: "OrdersController",
      workspaceSlug: opts.workspaceSlug,
      userLogin: opts.userLogin,
      durationMs: rng.int(35, 140)
    })
  );
  buffer.push({
    timestamp: clock.now(),
    level: "INFO",
    correlationId,
    event: "order_created",
    component: "OrdersService",
    workspaceSlug: opts.workspaceSlug,
    orderId: opts.orderId,
    status: "DRAFT",
    requiredMaterials: opts.requiredMaterials,
    testCodes: opts.testCodes
  });
  return { correlationId, orderId: opts.orderId };
}

function registerSampleStep(shared, ctx, opts) {
  const { buffer, clock, rng } = ctx;
  const correlationId = shared.randomCorrelationId(rng);
  const status = opts.status || 200;
  buffer.push(
    shared.httpEntry(clock, rng, {
      correlationId,
      method: "POST",
      path: "/api/v1/orders/{orderId}/samples",
      status,
      component: "OrdersController",
      workspaceSlug: opts.workspaceSlug,
      userLogin: opts.userLogin,
      errorCode: opts.errorCode,
      durationMs: rng.int(20, 95)
    })
  );
  buffer.push({
    timestamp: clock.now(),
    level: status >= 400 ? "WARN" : "INFO",
    correlationId,
    event: status >= 400 ? "sample_registration_rejected" : "sample_registered",
    component: "OrdersService",
    workspaceSlug: opts.workspaceSlug,
    orderId: opts.orderId,
    materialType: opts.materialType,
    previousStatus: opts.previousStatus,
    newStatus: opts.newStatus
  });
  return { correlationId };
}

function sendOrderStep(shared, ctx, opts) {
  const { buffer, clock, rng } = ctx;
  const correlationId = opts.correlationId || shared.randomCorrelationId(rng);
  const status = opts.status;
  buffer.push({
    timestamp: clock.tick(15, 45),
    level: "DEBUG",
    correlationId,
    event: "order_send_requested",
    component: "OrdersService",
    workspaceSlug: opts.workspaceSlug,
    orderId: opts.orderId
  });
  buffer.push(
    shared.httpEntry(clock, rng, {
      correlationId,
      method: "POST",
      path: "/api/v1/orders/{orderId}/send",
      status,
      component: "OrdersController",
      workspaceSlug: opts.workspaceSlug,
      userLogin: opts.userLogin,
      errorCode: opts.errorCode,
      durationMs: opts.durationMs ?? rng.int(40, 220)
    })
  );
  return { correlationId };
}

function labAcceptStep(shared, ctx, opts) {
  const { buffer, clock } = ctx;
  buffer.push({
    timestamp: clock.tick(5, 30),
    level: "INFO",
    correlationId: opts.correlationId,
    event: "lab_order_accepted",
    component: "LabSimulatorService",
    workspaceSlug: opts.workspaceSlug,
    orderId: opts.orderId,
    externalOrderId: opts.externalOrderId,
    scenario: opts.scenario || "SUCCESS"
  });
  buffer.push({
    timestamp: clock.now(),
    level: "DEBUG",
    correlationId: opts.correlationId,
    event: "lab_job_scheduled",
    component: "LabJobsScheduler",
    workspaceSlug: opts.workspaceSlug,
    orderId: opts.orderId,
    executeInSeconds: opts.executeInSeconds ?? 5
  });
}

function labCallbackStep(shared, ctx, opts) {
  const { buffer, clock, rng } = ctx;
  buffer.push({
    timestamp: clock.tick(200, 600),
    level: "DEBUG",
    correlationId: opts.correlationId,
    event: "lab_job_due",
    component: "LabJobsScheduler",
    workspaceSlug: opts.workspaceSlug,
    orderId: opts.orderId
  });
  buffer.push(
    shared.httpEntry(clock, rng, {
      correlationId: opts.correlationId,
      method: "POST",
      path: "/api/v1/integrations/lab/results",
      status: 204,
      component: "LabCallbacksController",
      durationMs: rng.int(15, 70)
    })
  );
  buffer.push({
    timestamp: clock.now(),
    level: "INFO",
    correlationId: opts.correlationId,
    event: opts.eventType || "lab_result_received",
    component: "LabCallbacksService",
    workspaceSlug: opts.workspaceSlug,
    orderId: opts.orderId,
    newStatus: opts.newStatus || "COMPLETED",
    eventId: opts.eventId
  });
}

function retryScheduledStep(shared, ctx, opts) {
  const { buffer, clock } = ctx;
  buffer.push({
    timestamp: clock.tick(10, 40),
    level: "WARN",
    correlationId: opts.correlationId,
    event: "lab_send_retry_scheduled",
    component: "OrdersService",
    workspaceSlug: opts.workspaceSlug,
    orderId: opts.orderId,
    attemptNumber: opts.attemptNumber,
    nextAttemptNumber: opts.attemptNumber + 1,
    retryAfterSeconds: opts.retryAfterSeconds
  });
}

function retryExecutedStep(shared, ctx, opts) {
  const { buffer, clock } = ctx;
  buffer.push({
    timestamp: clock.tick(opts.gapMs || 400, (opts.gapMs || 400) + 300),
    level: "DEBUG",
    correlationId: opts.correlationId,
    event: "lab_send_retry_due",
    component: "LabSendRetryScheduler",
    workspaceSlug: opts.workspaceSlug,
    orderId: opts.orderId,
    attemptNumber: opts.attemptNumber
  });
  buffer.push({
    timestamp: clock.tick(20, 80),
    level: opts.status >= 500 ? "ERROR" : opts.status < 300 ? "INFO" : "WARN",
    correlationId: opts.correlationId,
    event: "lab_send_retry_result",
    component: "LabSendRetryService",
    workspaceSlug: opts.workspaceSlug,
    orderId: opts.orderId,
    attemptNumber: opts.attemptNumber,
    status: opts.status,
    errorCode: opts.errorCode
  });
}

module.exports = {
  loginStep,
  createPatientStep,
  createOrderStep,
  registerSampleStep,
  sendOrderStep,
  labAcceptStep,
  labCallbackStep,
  retryScheduledStep,
  retryExecutedStep
};
