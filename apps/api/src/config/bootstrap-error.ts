const SENSITIVE_KEY_PATTERN = /(PASSWORD|SECRET|TOKEN|DATABASE_URL)/i;
const REDACTED = "[REDACTED]";

export function logBootstrapError(error: unknown) {
  console.error(
    JSON.stringify(
      {
        level: "error",
        event: "bootstrap_failed",
        message: "Nie udało się uruchomić aplikacji.",
        error: serializeBootstrapError(error)
      },
      null,
      2
    )
  );
}

export function serializeBootstrapError(error: unknown): unknown {
  if (error instanceof Error) {
    return {
      name: redactSecrets(error.name),
      message: redactSecrets(error.message),
      stack: redactSecrets(error.stack),
      cause: error.cause ? serializeBootstrapError(error.cause) : undefined
    };
  }

  if (typeof error === "string") {
    return redactSecrets(error);
  }

  return {
    value: redactSecrets(String(error))
  };
}

export function redactSecrets(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }

  let redacted = value;

  for (const [key, secret] of Object.entries(process.env)) {
    if (!SENSITIVE_KEY_PATTERN.test(key) || !secret || secret.length < 4) {
      continue;
    }
    redacted = redacted.split(secret).join(REDACTED);
  }

  redacted = redacted.replace(
    /\b(mysql|mariadb):\/\/([^:\s/?#]+):([^@\s/?#]+)@/gi,
    (_match, protocol: string, user: string) => `${protocol}://${user}:${REDACTED}@`
  );

  return redacted;
}
