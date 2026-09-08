import { parsePrismaDatabaseUrl } from "../common/prisma/prisma-client.factory";
import {
  resolveLabSimulatorScenario,
  type LabSimulatorScenario
} from "../lab-simulator/lab-simulator-scenario";

const NODE_ENV_VALUES = ["development", "test", "production"] as const;

type NodeEnv = (typeof NODE_ENV_VALUES)[number];

interface ValidatedEnv {
  NODE_ENV: NodeEnv;
  PORT: string;
  DATABASE_URL: string;
  SESSION_TOKEN_PEPPER: string;
  LAB_SIMULATOR_SCENARIO: LabSimulatorScenario;
  ADMIN_PASSWORD_HASH: string;
  ADMIN_SESSION_SECRET: string;
}

export function validateEnvironment(config: Record<string, unknown>): ValidatedEnv {
  const errors: string[] = [];
  const nodeEnv = readString(config, "NODE_ENV");
  const port = readString(config, "PORT");
  const databaseUrl = readString(config, "DATABASE_URL");
  const sessionTokenPepper = readString(config, "SESSION_TOKEN_PEPPER");

  let labSimulatorScenario: LabSimulatorScenario | undefined;
  try {
    labSimulatorScenario = resolveLabSimulatorScenario(
      readString(config, "LAB_SIMULATOR_SCENARIO")
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "LAB_SIMULATOR_SCENARIO jest nieprawidłowe.");
  }

  if (!nodeEnv || !NODE_ENV_VALUES.includes(nodeEnv as NodeEnv)) {
    errors.push(
      `NODE_ENV musi mieć jedną z wartości: ${NODE_ENV_VALUES.join(", ")}.`
    );
  }

  const parsedPort = Number(port);
  if (
    !port ||
    !Number.isInteger(parsedPort) ||
    parsedPort < 1 ||
    parsedPort > 65535
  ) {
    errors.push("PORT musi być liczbą całkowitą z zakresu 1-65535.");
  }

  try {
    parsePrismaDatabaseUrl(databaseUrl ?? "");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "DATABASE_URL jest nieprawidłowe.");
  }

  if (!sessionTokenPepper || sessionTokenPepper.trim().length < 16) {
    errors.push("SESSION_TOKEN_PEPPER musi mieć co najmniej 16 znaków.");
  }

  // Sekrety panelu prowadzącego (`/admin`). Ten panel ma osobne, techniczne
  // uwierzytelnienie, niezależne od kont STAFF — patrz AGENTS.md i
  // docs/ai/backend-playbook.md. Wartości nigdy nie są logowane ani zwracane
  // w odpowiedzi — walidujemy tylko obecność i minimalną długość.
  const adminPasswordHash = readString(config, "ADMIN_PASSWORD_HASH");
  if (!adminPasswordHash || adminPasswordHash.length < 8) {
    errors.push("ADMIN_PASSWORD_HASH musi być ustawione (hash hasła panelu prowadzącego).");
  }

  const adminSessionSecret = readString(config, "ADMIN_SESSION_SECRET");
  if (!adminSessionSecret || adminSessionSecret.trim().length < 16) {
    errors.push("ADMIN_SESSION_SECRET musi mieć co najmniej 16 znaków.");
  }

  if (errors.length > 0) {
    throw new Error(`Nieprawidłowa konfiguracja aplikacji:\n- ${errors.join("\n- ")}`);
  }

  return {
    NODE_ENV: nodeEnv as NodeEnv,
    PORT: port!,
    DATABASE_URL: databaseUrl!,
    SESSION_TOKEN_PEPPER: sessionTokenPepper!,
    LAB_SIMULATOR_SCENARIO: labSimulatorScenario!,
    ADMIN_PASSWORD_HASH: adminPasswordHash!,
    ADMIN_SESSION_SECRET: adminSessionSecret!
  };
}

function readString(config: Record<string, unknown>, key: string): string | undefined {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
