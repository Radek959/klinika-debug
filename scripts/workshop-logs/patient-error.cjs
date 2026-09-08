"use strict";

const { loginStep, createPatientStep } = require("./narrative.cjs");

/**
 * patient-error.log — incydent w obszarze walidacji pacjenta. Uczestnik
 * (tester09) wielokrotnie próbuje zapisać tego samego pacjenta niepełnoletnego
 * i za każdym razem dostaje inny błąd walidacji, zanim w końcu się uda.
 * Log NIE nazywa root cause wprost — pokazuje tylko chronologię requestów,
 * kodów błędów i pól, tak jak zrobiłby to realny access log.
 */
module.exports = function generatePatientError(shared) {
  const rng = shared.createRng(shared.SEED + 2);
  const clock = shared.createClock(rng, "2026-09-08T09:12:03.441Z");
  const buffer = shared.createBuffer();
  const ctx = { buffer, clock, rng };

  const workspaceSlug = "warsztat-09";
  const userLogin = "tester09";

  shared.noiseBlock(buffer, clock, rng, 10);
  loginStep(shared, ctx, { workspaceSlug, userLogin });
  shared.noiseBlock(buffer, clock, rng, 6);

  // Próba 1: brak kontaktu.
  createPatientStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    status: 422,
    errorCode: "PATIENT_VALIDATION_ERROR",
    fieldErrors: [{ field: "contact", code: "CONTACT_REQUIRED" }]
  });
  shared.noiseBlock(buffer, clock, rng, 4);

  // Próba 2: dodano telefon w złym formacie.
  createPatientStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    status: 422,
    errorCode: "PATIENT_VALIDATION_ERROR",
    fieldErrors: [{ field: "phone", code: "INVALID_PHONE" }]
  });
  shared.noiseBlock(buffer, clock, rng, 5);

  // Próba 3: poprawiono telefon, ale data urodzenia nie zgadza się z PESEL.
  createPatientStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    status: 422,
    errorCode: "PATIENT_VALIDATION_ERROR",
    fieldErrors: [{ field: "birthDate", code: "PESEL_BIRTH_DATE_MISMATCH" }]
  });
  shared.noiseBlock(buffer, clock, rng, 7);

  // Mylny trop: niezwiązany błąd 404 w zupełnie innym workspace, w tym samym
  // przedziale czasu — nie ma związku z incydentem pacjenta w warsztat-09.
  buffer.push(
    shared.httpEntry(clock, rng, {
      correlationId: shared.randomCorrelationId(rng),
      method: "GET",
      path: "/api/v1/orders/{orderId}",
      status: 404,
      component: "OrdersController",
      workspaceSlug: "warsztat-14",
      userLogin: "tester14",
      errorCode: "ORDER_NOT_FOUND",
      level: "WARN"
    })
  );
  shared.noiseBlock(buffer, clock, rng, 6);

  // Próba 4: poprawiono datę, ale pacjent jest niepełnoletni i brak opiekuna.
  createPatientStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    status: 422,
    errorCode: "PATIENT_VALIDATION_ERROR",
    fieldErrors: [{ field: "guardian", code: "GUARDIAN_REQUIRED" }]
  });
  shared.noiseBlock(buffer, clock, rng, 5);

  // Próba 5: dodano opiekuna, ale bez kontaktu opiekuna.
  createPatientStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    status: 422,
    errorCode: "PATIENT_VALIDATION_ERROR",
    fieldErrors: [{ field: "guardian.contact", code: "GUARDIAN_CONTACT_REQUIRED" }]
  });
  shared.noiseBlock(buffer, clock, rng, 6);

  // Próba 6: sukces.
  createPatientStep(shared, ctx, {
    workspaceSlug,
    userLogin,
    patientId: "patient-error-0001",
    status: 201
  });

  buffer.push({
    timestamp: clock.tick(10, 30),
    level: "INFO",
    correlationId: shared.randomCorrelationId(rng),
    event: "patient_created",
    component: "PatientsService",
    workspaceSlug,
    patientId: "patient-error-0001"
  });

  shared.noiseBlock(buffer, clock, rng, 65);

  return shared.writeLog("patient-error.log", buffer);
};
