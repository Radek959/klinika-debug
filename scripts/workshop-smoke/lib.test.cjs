"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const {
  maskSecrets,
  HttpClient,
  pollUntil,
  SmokeReport,
  generateSyntheticAdultPesel,
  generateSyntheticMinorPesel
} = require("./lib.cjs");

test("maskSecrets zastępuje każde wystąpienie sekretu", () => {
  const masked = maskSecrets("hasło=TajneHaslo123, token=TajneHaslo123!", [
    "TajneHaslo123",
    "TajneHaslo123!"
  ]);
  assert.equal(masked.includes("TajneHaslo123"), false);
  assert.match(masked, /\[REDACTED\]/);
});

test("maskSecrets nie zmienia tekstu bez sekretów i toleruje nietekstowe wejście", () => {
  assert.equal(maskSecrets("brak sekretów tutaj", ["cośInnego"]), "brak sekretów tutaj");
  assert.equal(maskSecrets(undefined, ["x"]), undefined);
});

test("SmokeReport renderuje wiersze w stałej kolejności i wynik PASS", () => {
  const report = new SmokeReport();
  report.pass("Health");
  report.pass("Admin login");
  report.skip("Reset", "brak potwierdzenia");
  const rendered = report.render();
  assert.match(rendered, /Health\s+PASS/);
  assert.match(rendered, /Admin login\s+PASS/);
  assert.match(rendered, /Reset\s+SKIP/);
  assert.match(rendered, /RESULT: PASS/);
  assert.ok(rendered.indexOf("Health") < rendered.indexOf("Admin login"));
});

test("SmokeReport zwraca RESULT: FAIL, gdy jakikolwiek krok się nie powiódł", () => {
  const report = new SmokeReport();
  report.pass("Health");
  report.fail("OpenAPI", "brak dokumentu");
  assert.equal(report.hasFailure(), true);
  assert.match(report.render(), /RESULT: FAIL/);
});

test("SmokeReport wyświetla detail dla FAIL", () => {
  const report = new SmokeReport();
  report.fail("Order flow", "Utworzenie zlecenia nie powiodło się (HTTP 422).");
  assert.match(
    report.render(),
    /Order flow\s+FAIL — Utworzenie zlecenia nie powiodło się \(HTTP 422\)\./
  );
});

test("SmokeReport wyświetla detail dla SKIP", () => {
  const report = new SmokeReport();
  report.skip("Reset", "brak potwierdzenia");
  assert.match(report.render(), /Reset\s+SKIP — brak potwierdzenia/);
});

test("SmokeReport wyświetla detail dla PASS", () => {
  const report = new SmokeReport();
  report.pass("Health", "wszystko sprawne");
  assert.match(report.render(), /Health\s+PASS — wszystko sprawne/);
});

test("SmokeReport nie dodaje separatora ani detalu, gdy detail nie istnieje", () => {
  const report = new SmokeReport();
  report.pass("Health");
  const rendered = report.render();
  assert.match(rendered, /^Health\s+PASS$/m);
  assert.equal(rendered.includes("—"), false);
});

test("generateSyntheticAdultPesel generuje strukturalnie poprawny PESEL", () => {
  const pesel = generateSyntheticAdultPesel(7);
  assert.equal(pesel.length, 11);
  assert.match(pesel, /^\d{11}$/);
  // ten sam serial zawsze daje ten sam wynik (deterministyczne, powtarzalne smoke)
  assert.equal(pesel, generateSyntheticAdultPesel(7));
  assert.notEqual(pesel, generateSyntheticAdultPesel(8));
});

test("generateSyntheticAdultPesel odrzuca serial poza zakresem", () => {
  assert.throws(() => generateSyntheticAdultPesel(-1));
  assert.throws(() => generateSyntheticAdultPesel(1000));
});

test("generateSyntheticMinorPesel generuje PESEL osoby poniżej 18 lat z poprawną sumą kontrolną", () => {
  const pesel = generateSyntheticMinorPesel(3);
  assert.match(pesel, /^\d{11}$/);

  const currentYear = new Date().getUTCFullYear();
  const expectedBirthYear = currentYear - 10;
  // Rok 2000+ jest kodowany miesiącem przesuniętym o 20 (patrz
  // packages/domain/src/patients/pesel.ts#readPeselCentury).
  const encodedMonth = Number(pesel.slice(2, 4));
  assert.equal(encodedMonth, 21);
  assert.equal(Number(pesel.slice(0, 2)), expectedBirthYear % 100);

  const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  const sum = weights.reduce((total, weight, index) => total + Number(pesel[index]) * weight, 0);
  const checksum = (10 - (sum % 10)) % 10;
  assert.equal(checksum, Number(pesel[10]));
});

test("pollUntil zwraca wynik od razu, gdy warunek jest spełniony natychmiast", async () => {
  let calls = 0;
  const result = await pollUntil(
    async () => {
      calls += 1;
      return { done: true };
    },
    { isDone: (value) => value.done, intervalMs: 5, timeoutMs: 1000 }
  );
  assert.deepEqual(result, { done: true });
  assert.equal(calls, 1);
});

test("pollUntil ponawia w regularnym interwale, aż warunek się spełni", async () => {
  let calls = 0;
  const result = await pollUntil(
    async () => {
      calls += 1;
      return { done: calls >= 3 };
    },
    { isDone: (value) => value.done, intervalMs: 5, timeoutMs: 1000 }
  );
  assert.equal(calls, 3);
  assert.equal(result.done, true);
});

test("pollUntil rzuca czytelny błąd timeoutu, gdy warunek nigdy nie jest spełniony", async () => {
  await assert.rejects(
    pollUntil(async () => ({ done: false }), {
      isDone: (value) => value.done,
      intervalMs: 5,
      timeoutMs: 20
    }),
    (error) => {
      assert.match(error.message, /Przekroczono limit czasu/);
      assert.equal(error.timedOut, true);
      return true;
    }
  );
});

function withServer(handler, run) {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", async () => {
      const { port } = server.address();
      try {
        await run(`http://127.0.0.1:${port}`);
        resolvePromise();
      } catch (error) {
        rejectPromise(error);
      } finally {
        server.close();
      }
    });
  });
}

test("HttpClient: odpowiedź 200 z correlationId i ciałem JSON", async () => {
  await withServer(
    (req, res) => {
      res.setHeader("X-Correlation-ID", "corr-123");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    },
    async (baseUrl) => {
      const client = new HttpClient(baseUrl);
      const response = await client.get("/anything");
      assert.equal(response.status, 200);
      assert.equal(response.correlationId, "corr-123");
      assert.deepEqual(response.json, { ok: true });
    }
  );
});

test("HttpClient: odpowiedź 401 jest zwracana bez rzucania wyjątku", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "UNAUTHORIZED" } }));
    },
    async (baseUrl) => {
      const client = new HttpClient(baseUrl);
      const response = await client.get("/secure");
      assert.equal(response.status, 401);
      assert.equal(response.ok, false);
      assert.equal(response.json.error.code, "UNAUTHORIZED");
    }
  );
});

test("HttpClient: odpowiedź 500 jest zwracana bez rzucania wyjątku", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "INTERNAL" } }));
    },
    async (baseUrl) => {
      const client = new HttpClient(baseUrl);
      const response = await client.get("/broken");
      assert.equal(response.status, 500);
      assert.equal(response.json.error.code, "INTERNAL");
    }
  );
});

test("HttpClient: brak nagłówka correlationId daje null zamiast wyjątku", async () => {
  await withServer(
    (req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    },
    async (baseUrl) => {
      const client = new HttpClient(baseUrl);
      const response = await client.get("/no-correlation");
      assert.equal(response.correlationId, null);
    }
  );
});

test("HttpClient: przekracza limit czasu i rzuca błąd zamiast wisieć", async () => {
  await withServer(
    () => {
      // celowo nigdy nie odpowiada
    },
    async (baseUrl) => {
      const client = new HttpClient(baseUrl, { timeoutMs: 30 });
      await assert.rejects(client.get("/slow"));
    }
  );
});

test("HttpClient: przechowuje i wysyła ciasteczko sesji z Set-Cookie", async () => {
  let receivedCookie;
  await withServer(
    (req, res) => {
      if (req.url === "/login") {
        res.setHeader("Set-Cookie", "adminSession=secret-token; Path=/admin; HttpOnly");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      receivedCookie = req.headers.cookie;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    },
    async (baseUrl) => {
      const client = new HttpClient(baseUrl);
      await client.post("/login", { password: "secret-token" });
      await client.get("/config");
      assert.equal(receivedCookie, "adminSession=secret-token");
    }
  );
});
