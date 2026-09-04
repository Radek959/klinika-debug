const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join, resolve } = require("node:path");

const repoRoot = resolve(__dirname, "..");
const apiEntry = join(repoRoot, "apps", "api", "dist", "main.js");
const webIndex = join(repoRoot, "apps", "web", "dist", "index.html");

if (!process.env.TEST_DATABASE_URL) {
  console.error("TEST_DATABASE_URL musi wskazywać oddzielną testową bazę MySQL.");
  process.exit(1);
}

if (!existsSync(apiEntry) || !existsSync(webIndex)) {
  console.error("Najpierw wykonaj build: npm run build.");
  process.exit(1);
}

const port = process.env.SMOKE_PORT ?? "33080";
const app = spawn(process.execPath, [apiEntry], {
  cwd: join(repoRoot, "apps", "api"),
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: port,
    DATABASE_URL: process.env.TEST_DATABASE_URL,
    SESSION_TOKEN_PEPPER:
      process.env.SESSION_TOKEN_PEPPER ?? "smoke-test-session-pepper"
  }
});

let output = "";
app.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
app.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

const baseUrl = `http://127.0.0.1:${port}`;

run()
  .then(async () => {
    await stopApp();
  })
  .catch(async (error) => {
    console.error(error);
    if (output.trim()) {
      console.error(output.trim());
    }
    await stopApp();
    process.exit(1);
  });

async function run() {
  await waitForServer();

  const login = await fetchText("/login", "text/html");
  if (!login.body.includes("Klinika Debug") || !login.body.includes("/assets/")) {
    throw new Error("/login nie zwrócił zbudowanego frontendu.");
  }

  const health = await fetchJson("/health/live");
  if (health.status !== "ok") {
    throw new Error("/health/live nie zwrócił statusu ok.");
  }

  const docs = await fetchText("/api/docs", "text/html");
  if (!docs.body.includes("Klinika Debug API")) {
    throw new Error("/api/docs nie zwrócił dokumentacji OpenAPI.");
  }

  const reserved = await fetch(`${baseUrl}/api?source=smoke`, {
    headers: { Accept: "text/html" }
  });
  const reservedBody = await reserved.text();
  if (reserved.ok || reservedBody.includes("/assets/")) {
    throw new Error("/api z query stringiem nie może zwracać index.html.");
  }
}

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    if (app.exitCode !== null) {
      throw new Error(`Aplikacja zakończyła start kodem ${app.exitCode}.`);
    }

    try {
      await fetchText("/health/live", "application/json");
      return;
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
  }

  throw new Error("Aplikacja produkcyjna nie wystartowała w oczekiwanym czasie.");
}

async function fetchText(path, accept) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: accept }
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${path} zwrócił HTTP ${response.status}: ${body}`);
  }
  return { response, body };
}

async function fetchJson(path) {
  const { body } = await fetchText(path, "application/json");
  return JSON.parse(body);
}

async function stopApp() {
  if (app.exitCode !== null) {
    return;
  }

  app.kill();
  await new Promise((resolveStopped) => {
    app.once("exit", resolveStopped);
    setTimeout(resolveStopped, 2000);
  });
}
