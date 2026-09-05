import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const DEFAULT_CONNECTION_LIMIT = 2;
const DEFAULT_MYSQL_PORT = 3306;

export interface PrismaDatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
}

export function createPrismaClient() {
  return new PrismaClient({
    adapter: createPrismaAdapter()
  });
}

export function createPrismaAdapter(databaseUrl = process.env.DATABASE_URL) {
  return new PrismaMariaDb(createPrismaMariaDbConfig(databaseUrl));
}

export function createPrismaMariaDbConfig(
  databaseUrl = process.env.DATABASE_URL
): PrismaDatabaseConfig {
  const parsed = parsePrismaDatabaseUrl(databaseUrl);
  return {
    ...parsed,
    connectionLimit: DEFAULT_CONNECTION_LIMIT
  };
}

export function parsePrismaDatabaseUrl(
  databaseUrl = process.env.DATABASE_URL
): Omit<PrismaDatabaseConfig, "connectionLimit"> {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL jest wymagane.");
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL musi być poprawnym adresem MySQL.");
  }

  if (parsed.protocol !== "mysql:" && parsed.protocol !== "mariadb:") {
    throw new Error("DATABASE_URL musi zaczynać się od mysql:// albo mariadb://.");
  }

  const host = parsed.hostname;
  const user = decodeUrlPart(parsed.username, "użytkownika");
  const password = decodeUrlPart(parsed.password, "hasła");
  const database = decodeUrlPart(parsed.pathname.replace(/^\/+/, ""), "bazy danych");
  const port = parsed.port ? Number(parsed.port) : DEFAULT_MYSQL_PORT;

  if (!host) {
    throw new Error("DATABASE_URL musi zawierać host bazy danych.");
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DATABASE_URL musi zawierać poprawny port bazy danych.");
  }

  if (!user) {
    throw new Error("DATABASE_URL musi zawierać użytkownika bazy danych.");
  }

  if (!password) {
    throw new Error("DATABASE_URL musi zawierać hasło bazy danych.");
  }

  if (!database) {
    throw new Error("DATABASE_URL musi zawierać nazwę bazy danych.");
  }

  return {
    host,
    port,
    user,
    password,
    database
  };
}

function decodeUrlPart(value: string, label: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(`DATABASE_URL zawiera niepoprawnie zakodowaną część ${label}.`);
  }
}
