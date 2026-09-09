#!/usr/bin/env node
"use strict";

/**
 * `npm run workshop:smoke` — smoke test przebiegu warsztatowego uruchamiany
 * przeciwko RZECZYWIŚCIE WDROŻONEJ Klinice Debug (patrz
 * `docs/warsztat/workshop-readiness.md`).
 *
 * Bezpieczeństwo:
 * - nigdy nie loguje haseł, tokenów admina/uczestnika ani wartości ciastek
 *   (patrz `maskSecrets`/`safeLog` poniżej — używane przy KAŻDYM logu);
 * - drukuje host przed startem, ale nigdy sekrety;
 * - bez `WORKSHOP_SMOKE_CONFIRM=RUN` wykonuje wyłącznie read-only preflight
 *   (health, odczyt configu admina, OpenAPI, log fixtures, materiał /materials
 *   webowego builda) i kończy się bez
 *   żadnej zmiany danych;
 * - z potwierdzeniem, na końcu ZAWSZE (także po błędzie w trakcie testu)
 *   próbuje przywrócić SUCCESS + CLEAN i zresetować środowisko w `finally`.
 */

const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { readWorkshopSmokeConfig } = require("./workshop-smoke/config.cjs");
const {
  HttpClient,
  SmokeReport,
  pollUntil,
  maskSecrets,
  generateSyntheticAdultPesel,
  generateSyntheticMinorPesel
} = require("./workshop-smoke/lib.cjs");

main().then(
  (exitCode) => process.exit(exitCode),
  (error) => {
    console.error("workshop:smoke zakończyło się nieoczekiwanym błędem:");
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exit(1);
  }
);

async function main() {
  const config = readWorkshopSmokeConfig(process.env);
  const log = (message) => console.log(maskSecrets(message, config.secrets));

  log("Workshop readiness smoke");
  log(`Host: ${config.baseUrl}`);
  log(
    config.confirmed
      ? "Tryb: PEŁNY (WORKSHOP_SMOKE_CONFIRM=RUN)"
      : "Tryb: READ-ONLY PREFLIGHT (ustaw WORKSHOP_SMOKE_CONFIRM=RUN, żeby wykonać pełny smoke)"
  );
  log("");

  const report = new SmokeReport();
  const client = new HttpClient(config.baseUrl, { timeoutMs: config.requestTimeoutMs });
  const adminClient = new HttpClient(config.baseUrl, { timeoutMs: config.requestTimeoutMs });

  let cleanupNeeded = false;

  try {
    await runHealthCheck(client, report);
    await runAdminLoginAndReadConfig(adminClient, config, report);

    if (!config.confirmed) {
      report.skip("Reset", "brak WORKSHOP_SMOKE_CONFIRM=RUN — tylko odczyt.");
      report.skip("Participant login", "wymaga potwierdzenia (WORKSHOP_SMOKE_CONFIRM=RUN).");
      report.skip("Workspace isolation", "wymaga potwierdzenia.");
      report.skip("Patient flow", "wymaga potwierdzenia.");
      report.skip("Order flow", "wymaga potwierdzenia.");
      report.skip("Lab SUCCESS", "wymaga potwierdzenia.");
      report.skip("Correlation ID", "wymaga potwierdzenia.");
      report.skip("PATIENT_GUARDIAN", "wymaga potwierdzenia.");
      report.skip("ORDER_FLOW", "wymaga potwierdzenia.");
      report.skip("API_DIAGNOSTICS", "wymaga potwierdzenia.");
      report.skip("Final cleanup", "brak zmian do wyczyszczenia w trybie read-only.");
    } else {
      cleanupNeeded = true;

      await runReset(adminClient, report);
      await runLabDelaySetup(adminClient, report);

      const { testerOne, testerTwo } = await runParticipantLogin(client, config, report);
      await runWorkspaceIsolation(client, testerOne, testerTwo, report);

      const patient = await runPatientFlow(client, testerOne, report);
      const order = await runOrderFlow(client, testerOne, patient, report);
      await runLabSuccess(client, testerOne, order, config, report);
      runCorrelationIdCheck(order, report);

      await runPatientGuardianDefect(client, adminClient, testerOne, report);
      await runOrderFlowDefect(client, adminClient, testerOne, report);
      await runApiDiagnosticsDefect(client, adminClient, testerOne, report);
    }

    runOpenApiCheck(await client.get("/api/docs-json", { expectJson: true }), report);
    runLogFixturesCheck(report);
    await runMaterialsAssetCheck(client, report);
  } catch (error) {
    const step = error && error.smokeStep;
    if (step) {
      report.fail(step, describeError(error));
    } else {
      report.fail("Unexpected error", describeError(error));
    }
  } finally {
    if (cleanupNeeded) {
      await runFinalCleanup(adminClient, report, log);
    }
  }

  log("");
  log(report.render());

  return report.hasFailure() ? 1 : 0;
}

function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(step, message) {
  const error = new Error(message);
  error.smokeStep = step;
  return error;
}

async function runHealthCheck(client, report) {
  const live = await client.get("/health/live");
  if (live.status !== 200 || live.json?.status !== "ok") {
    throw fail("Health", `/health/live nie zwróciło statusu ok (HTTP ${live.status}).`);
  }

  const ready = await client.get("/health/ready");
  if (ready.status !== 200 || ready.json?.status !== "ok") {
    throw fail("Health", `/health/ready nie zwróciło statusu ok (HTTP ${ready.status}).`);
  }

  const page = await client.get("/", {
    headers: { Accept: "text/html" },
    expectJson: false
  });
  if (page.status !== 200) {
    throw fail("Health", `Strona aplikacji ("/") zwróciła HTTP ${page.status}.`);
  }

  report.pass("Health");
}

async function runAdminLoginAndReadConfig(adminClient, config, report) {
  const login = await adminClient.post("/admin/api/login", { password: config.adminPassword });
  if (login.status !== 200) {
    throw fail("Admin login", `Logowanie do /admin nie powiodło się (HTTP ${login.status}).`);
  }

  const readConfig = await adminClient.get("/admin/api/config");
  if (readConfig.status !== 200 || !readConfig.json?.labScenario) {
    throw fail("Admin login", "Odczyt konfiguracji /admin/api/config nie powiódł się.");
  }

  report.pass("Admin login");
}

async function runReset(adminClient, report) {
  const reset = await adminClient.post("/admin/api/reset", { confirm: true });
  if (reset.status !== 200) {
    throw fail("Reset", `Reset środowiska warsztatowego nie powiódł się (HTTP ${reset.status}).`);
  }

  const config = reset.json?.config;
  if (config?.labScenario !== "SUCCESS" || config?.controlledBug !== "CLEAN") {
    throw fail("Reset", "Po resecie konfiguracja nie jest w stanie SUCCESS + CLEAN.");
  }

  report.pass("Reset");
}

/**
 * Ustawia labDelayMs=5000 (5 s) PO resecie środowiskowym (`runReset`) —
 * reset przywraca domyślne 300000 ms (5 min), więc gdyby ta konfiguracja
 * nastąpiła PRZED resetem, `runLabSuccess` zaczynałby oczekiwanie na wynik
 * przy realnym opóźnieniu 5 minut zamiast 5 sekund i przekraczałby
 * `labTimeoutMs`. Kończy smoke natychmiast czytelnym błędem, jeżeli
 * odczytana z powrotem konfiguracja nie potwierdza 5000 ms.
 */
async function runLabDelaySetup(adminClient, report) {
  const config = await setWorkshopConfig(adminClient, "SUCCESS", "CLEAN", 5000);
  if (config?.labDelayMs !== 5000) {
    throw fail(
      "Lab delay setup",
      `Po ustawieniu labDelayMs=5000 /admin/api/config zwróciło ${config?.labDelayMs}.`
    );
  }
  report.pass("Lab delay setup");
}

async function runParticipantLogin(client, config, report) {
  const testerOne = new HttpClient(client.baseUrl, { timeoutMs: client.timeoutMs });
  const testerTwo = new HttpClient(client.baseUrl, { timeoutMs: client.timeoutMs });

  const loginOne = await testerOne.post("/api/v1/auth/login", {
    login: "tester01",
    password: config.staffPassword
  });
  const loginTwo = await testerTwo.post("/api/v1/auth/login", {
    login: "tester02",
    password: config.staffPassword
  });

  if (loginOne.status !== 200 || loginTwo.status !== 200) {
    throw fail(
      "Participant login",
      `Logowanie tester01/tester02 nie powiodło się (HTTP ${loginOne.status}/${loginTwo.status}).`
    );
  }

  testerOne.token = loginOne.json?.token;
  testerTwo.token = loginTwo.json?.token;
  testerOne.authHeaders = () => ({ Authorization: `Bearer ${testerOne.token}` });
  testerTwo.authHeaders = () => ({ Authorization: `Bearer ${testerTwo.token}` });

  if (!testerOne.token || !testerTwo.token) {
    throw fail("Participant login", "Odpowiedź logowania nie zawiera tokenu.");
  }

  const meOne = await testerOne.get("/api/v1/auth/me", { headers: testerOne.authHeaders() });
  const meTwo = await testerTwo.get("/api/v1/auth/me", { headers: testerTwo.authHeaders() });

  testerOne.workspaceId = meOne.json?.user?.workspace?.id;
  testerTwo.workspaceId = meTwo.json?.user?.workspace?.id;

  if (
    !testerOne.workspaceId ||
    !testerTwo.workspaceId ||
    testerOne.workspaceId === testerTwo.workspaceId
  ) {
    throw fail("Participant login", "tester01 i tester02 muszą należeć do różnych workspace'ów.");
  }

  report.pass("Participant login");
  return { testerOne, testerTwo };
}

async function runWorkspaceIsolation(client, testerOne, testerTwo, report) {
  const pesel = generateSyntheticAdultPesel(901);
  const created = await testerOne.post(
    "/api/v1/patients",
    buildSyntheticPatient(pesel),
    { headers: testerOne.authHeaders() }
  );

  if (created.status !== 201) {
    throw fail("Workspace isolation", `Nie udało się utworzyć pacjenta izolacyjnego (HTTP ${created.status}).`);
  }

  const patientId = created.json?.id;
  const crossAccess = await testerTwo.get(`/api/v1/patients/${patientId}`, {
    headers: testerTwo.authHeaders()
  });

  if (crossAccess.status !== 404) {
    throw fail(
      "Workspace isolation",
      `tester02 nie powinien mieć dostępu do pacjenta tester01 (HTTP ${crossAccess.status}).`
    );
  }

  report.pass("Workspace isolation");
}

function buildSyntheticPatient(pesel, overrides = {}) {
  return {
    firstName: "Smoke",
    lastName: "Testowy",
    identifierType: "PESEL",
    pesel,
    birthDate: "1990-01-15",
    gender: "MALE",
    citizenship: "PL",
    ...overrides
  };
}

async function runPatientFlow(client, testerOne, report) {
  const pesel = generateSyntheticAdultPesel(902);
  const created = await testerOne.post(
    "/api/v1/patients",
    buildSyntheticPatient(pesel),
    { headers: testerOne.authHeaders() }
  );

  if (created.status !== 201 || !created.json?.id) {
    throw fail("Patient flow", `Utworzenie syntetycznego pacjenta nie powiodło się (HTTP ${created.status}).`);
  }

  report.pass("Patient flow");
  return created.json;
}

async function runOrderFlow(client, testerOne, patient, report) {
  const catalog = await testerOne.get("/api/v1/tests", { headers: testerOne.authHeaders() });
  const glucoseTest = catalog.json?.items?.find((test) => test.code === "GLU");
  if (!glucoseTest) {
    throw fail("Order flow", "Katalog badań nie zawiera badania GLU wymaganego przez główną ścieżkę.");
  }

  const createOrder = await testerOne.post(
    "/api/v1/orders",
    {
      patientId: patient.id,
      priority: "ROUTINE",
      tests: [
        {
          medicalTestId: glucoseTest.id,
          additionalData: { PATIENT_PREPARED: true }
        }
      ]
    },
    { headers: testerOne.authHeaders() }
  );

  if (createOrder.status !== 201) {
    throw fail("Order flow", `Utworzenie zlecenia nie powiodło się (HTTP ${createOrder.status}).`);
  }

  const order = createOrder.json;
  const requiredSample = order.samples?.[0];
  if (!requiredSample) {
    throw fail("Order flow", "Zlecenie nie zawiera wymaganej próbki.");
  }

  const registerSample = await testerOne.post(
    `/api/v1/orders/${order.id}/samples`,
    {
      materialType: requiredSample.materialType,
      barcode: `SMOKE-${Date.now()}`,
      collectedAt: new Date().toISOString()
    },
    { headers: testerOne.authHeaders() }
  );

  if (registerSample.status !== 200 || registerSample.json?.status !== "SAMPLE_COLLECTED") {
    throw fail(
      "Order flow",
      `Rejestracja próbki nie ustawiła statusu SAMPLE_COLLECTED (HTTP ${registerSample.status}).`
    );
  }

  report.pass("Order flow");
  return registerSample.json;
}

async function runLabSuccess(client, testerOne, order, config, report) {
  const send = await testerOne.post(`/api/v1/orders/${order.id}/send`, undefined, {
    headers: testerOne.authHeaders()
  });

  if (send.status !== 200 || send.json?.status !== "SENT_TO_LAB") {
    throw fail("Lab SUCCESS", `Wysyłka do laboratorium nie powiodła się (HTTP ${send.status}).`);
  }

  const finalOrder = await pollUntil(
    () => testerOne.get(`/api/v1/orders/${order.id}`, { headers: testerOne.authHeaders() }),
    {
      isDone: (response) =>
        response.json?.status === "COMPLETED" || response.json?.status === "TECHNICAL_ERROR",
      intervalMs: config.pollIntervalMs,
      timeoutMs: config.labTimeoutMs
    }
  ).catch(() => {
    throw fail("Lab SUCCESS", "Wynik badania nie osiągnął stanu końcowego w wyznaczonym czasie.");
  });

  if (finalOrder.json?.status !== "COMPLETED") {
    throw fail("Lab SUCCESS", `Oczekiwano statusu COMPLETED dla scenariusza SUCCESS, otrzymano ${finalOrder.json?.status}.`);
  }

  report.pass("Lab SUCCESS");
  Object.assign(order, finalOrder.json);
}

function runCorrelationIdCheck(order, report) {
  if (!order.correlationId) {
    throw fail("Correlation ID", "Zlecenie po wysyłce nie zawiera correlationId.");
  }
  report.pass("Correlation ID");
}

async function runPatientGuardianDefect(client, adminClient, testerOne, report) {
  await setWorkshopConfig(adminClient, "SUCCESS", "PATIENT_GUARDIAN");

  const minorBirthYear = new Date().getUTCFullYear() - 10;
  const minorPesel = generateSyntheticMinorPesel(903);
  const response = await testerOne.post(
    "/api/v1/patients",
    buildSyntheticPatient(minorPesel, {
      birthDate: `${minorBirthYear}-01-15`,
      guardian: null
    }),
    { headers: testerOne.authHeaders() }
  );

  // W trybie CLEAN taki request zwróciłby 422 (brak opiekuna dla niepełnoletniego).
  // Kontrolowany defekt PATIENT_GUARDIAN celowo wyłącza tę regułę.
  if (response.status !== 201) {
    throw fail(
      "PATIENT_GUARDIAN",
      `Oczekiwano, że defekt PATIENT_GUARDIAN pozwoli utworzyć niepełnoletniego pacjenta bez opiekuna (HTTP ${response.status}).`
    );
  }

  await setWorkshopConfig(adminClient, "SUCCESS", "CLEAN");
  report.pass("PATIENT_GUARDIAN");
}

async function runOrderFlowDefect(client, adminClient, testerOne, report) {
  await setWorkshopConfig(adminClient, "SUCCESS", "ORDER_FLOW");

  const pesel = generateSyntheticAdultPesel(904);
  const patient = await testerOne.post("/api/v1/patients", buildSyntheticPatient(pesel), {
    headers: testerOne.authHeaders()
  });

  const catalog = await testerOne.get("/api/v1/tests", { headers: testerOne.authHeaders() });
  const morfologia = catalog.json?.items?.find((test) => test.code === "MORF");
  const crp = catalog.json?.items?.find((test) => test.code === "CRP");
  if (!morfologia || !crp) {
    throw fail("ORDER_FLOW", "Katalog badań nie zawiera MORF/CRP wymaganych do co najmniej dwóch materiałów.");
  }

  const order = await testerOne.post(
    "/api/v1/orders",
    {
      patientId: patient.json?.id,
      priority: "ROUTINE",
      tests: [{ medicalTestId: morfologia.id }, { medicalTestId: crp.id }]
    },
    { headers: testerOne.authHeaders() }
  );

  const firstSample = order.json?.samples?.[0];
  if (!firstSample) {
    throw fail("ORDER_FLOW", "Zlecenie diagnostyczne nie ma wymaganych próbek.");
  }

  const registerFirstSample = await testerOne.post(
    `/api/v1/orders/${order.json.id}/samples`,
    {
      materialType: firstSample.materialType,
      barcode: `SMOKE-BUG-${Date.now()}`,
      collectedAt: new Date().toISOString()
    },
    { headers: testerOne.authHeaders() }
  );

  // Poprawnie: po PIERWSZEJ z dwóch wymaganych próbek status powinien być
  // SAMPLE_COLLECTION_IN_PROGRESS. Kontrolowany defekt ORDER_FLOW celowo
  // ustawia od razu SAMPLE_COLLECTED — to obserwowalne, celowo błędne
  // zachowanie opisane w specyfikacji Workshop MVP.
  if (registerFirstSample.json?.status !== "SAMPLE_COLLECTED") {
    throw fail(
      "ORDER_FLOW",
      `Oczekiwano obserwowalnego defektu ORDER_FLOW (status SAMPLE_COLLECTED po pierwszej próbce), otrzymano ${registerFirstSample.json?.status}.`
    );
  }

  await setWorkshopConfig(adminClient, "SUCCESS", "CLEAN");
  report.pass("ORDER_FLOW");
}

async function runApiDiagnosticsDefect(client, adminClient, testerOne, report) {
  await setWorkshopConfig(adminClient, "SUCCESS", "API_DIAGNOSTICS");

  const pesel = generateSyntheticAdultPesel(905);
  const patient = await testerOne.post("/api/v1/patients", buildSyntheticPatient(pesel), {
    headers: testerOne.authHeaders()
  });

  const catalog = await testerOne.get("/api/v1/tests", { headers: testerOne.authHeaders() });
  const tsh = catalog.json?.items?.find((test) => test.code === "TSH");
  if (!tsh) {
    throw fail("API_DIAGNOSTICS", "Katalog badań nie zawiera badania TSH.");
  }

  const order = await testerOne.post(
    "/api/v1/orders",
    { patientId: patient.json?.id, priority: "ROUTINE", tests: [{ medicalTestId: tsh.id }] },
    { headers: testerOne.authHeaders() }
  );

  const sample = order.json?.samples?.[0];
  await testerOne.post(
    `/api/v1/orders/${order.json.id}/samples`,
    {
      materialType: sample.materialType,
      barcode: `SMOKE-DIAG-${Date.now()}`,
      collectedAt: new Date().toISOString()
    },
    { headers: testerOne.authHeaders() }
  );

  const send = await testerOne.post(`/api/v1/orders/${order.json.id}/send`, undefined, {
    headers: testerOne.authHeaders()
  });

  if (send.status !== 500) {
    throw fail("API_DIAGNOSTICS", `Oczekiwano bezpiecznego HTTP 500 dla zlecenia TSH (otrzymano ${send.status}).`);
  }
  if (!send.correlationId && !send.json?.error?.correlationId) {
    throw fail("API_DIAGNOSTICS", "Odpowiedź 500 nie zawiera correlationId.");
  }
  const bodyText = send.text ?? "";
  if (/PATIENT_GUARDIAN|ORDER_FLOW|API_DIAGNOSTICS|stack|at [A-Za-z]+\.[a-z]+ \(/i.test(bodyText)) {
    throw fail(
      "API_DIAGNOSTICS",
      "Odpowiedź 500 ujawnia nazwę kontrolowanego błędu albo wygląda na stack trace."
    );
  }

  await setWorkshopConfig(adminClient, "SUCCESS", "CLEAN");
  report.pass("API_DIAGNOSTICS");
}

/**
 * Zmienia `labScenario`/`controlledBug`. Gdy `labDelayMs` nie jest podane,
 * zachowuje AKTUALNIE skonfigurowaną wartość zamiast cichego resetu do
 * 300000 ms — zmiana samego scenariusza albo kontrolowanego błędu (np.
 * `runPatientGuardianDefect`) nie może przypadkiem odwrócić `labDelayMs=5000`
 * ustawionego przez `runLabDelaySetup` dla `runLabSuccess`.
 */
async function setWorkshopConfig(adminClient, labScenario, controlledBug, labDelayMs) {
  let resolvedLabDelayMs = labDelayMs;
  if (resolvedLabDelayMs === undefined) {
    const current = await adminClient.get("/admin/api/config");
    if (current.status !== 200 || typeof current.json?.labDelayMs !== "number") {
      throw fail("Reset", "Nie udało się odczytać bieżącego labDelayMs przed zmianą konfiguracji.");
    }
    resolvedLabDelayMs = current.json.labDelayMs;
  }

  const response = await adminClient.put("/admin/api/config", {
    labScenario,
    controlledBug,
    labDelayMs: resolvedLabDelayMs
  });
  if (response.status !== 200) {
    throw fail(
      "Reset",
      `Nie udało się ustawić konfiguracji labScenario=${labScenario}, controlledBug=${controlledBug} (HTTP ${response.status}).`
    );
  }
  return response.json;
}

function runOpenApiCheck(response, report) {
  if (response.status !== 200 || !response.json) {
    throw fail("OpenAPI", `Dokument OpenAPI nie jest dostępny (HTTP ${response.status}).`);
  }

  const paths = Object.keys(response.json.paths ?? {});
  const hasParticipantEndpoints = paths.some((p) => p.startsWith("/patients") || p.includes("/orders"));
  const exposesAdminApi = paths.some((p) => p.startsWith("/admin"));

  if (!hasParticipantEndpoints) {
    throw fail("OpenAPI", "Dokument OpenAPI nie zawiera wymaganych endpointów uczestnika.");
  }
  if (exposesAdminApi) {
    throw fail("OpenAPI", "Dokument OpenAPI ujawnia API panelu /admin.");
  }

  report.pass("OpenAPI");
}

function runLogFixturesCheck(report) {
  try {
    execFileSync(process.execPath, [path.join(__dirname, "validate-workshop-logs.cjs")], {
      cwd: path.join(__dirname, ".."),
      stdio: "pipe"
    });
    report.pass("Log fixtures");
  } catch (error) {
    throw fail("Log fixtures", `npm run test:workshop-logs nie powiodło się: ${describeError(error)}`);
  }
}

/**
 * Read-only sprawdzenie, że materiał `Materiały` jest faktycznie dostępny po
 * deployu jako statyczny asset webowy (`workshop-log-browser`) — celowo
 * pobiera TYLKO jeden, mały fixture (`happy-path.log`), a nie wszystkie
 * siedem plików.
 */
async function runMaterialsAssetCheck(client, report) {
  const response = await client.get("/materials/logs/happy-path.log", { expectJson: false });
  if (response.status !== 200 || !response.text) {
    throw fail(
      "Materials asset",
      `/materials/logs/happy-path.log nie zwróciło HTTP 200 z treścią (HTTP ${response.status}).`
    );
  }
  report.pass("Materials asset");
}

async function runFinalCleanup(adminClient, report, log) {
  try {
    await setWorkshopConfig(adminClient, "SUCCESS", "CLEAN", 300000);
    const reset = await adminClient.post("/admin/api/reset", { confirm: true });
    if (reset.status !== 200) {
      throw new Error(`Reset końcowy zwrócił HTTP ${reset.status}.`);
    }
    report.pass("Final cleanup");
  } catch (error) {
    report.fail("Final cleanup", describeError(error));
    log(
      "UWAGA: sprzątanie końcowe nie powiodło się — środowisko warsztatowe może wymagać RĘCZNEGO resetu (SUCCESS + CLEAN + reset w /admin) przed szkoleniem."
    );
  }
}
