import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function findRepoRoot(startDirectory: string): string {
  let current = resolve(startDirectory);

  while (true) {
    const packageJsonPath = join(current, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
          workspaces?: unknown;
        };
        if (Array.isArray(packageJson.workspaces)) {
          return current;
        }
      } catch {
        // Keep walking up; a malformed package.json is not the repo root marker.
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      throw new Error(
        `Nie udało się ustalić katalogu głównego repozytorium od: ${startDirectory}`
      );
    }
    current = parent;
  }
}

export function getApiRuntimeRoot(): string {
  return findRepoRoot(__dirname);
}

export function getEnvFilePaths(): string[] {
  const root = getApiRuntimeRoot();
  return [join(root, ".env.local"), join(root, ".env")];
}

export function getWebDistPath(): string {
  if (process.env.WEB_DIST_DIR) {
    return resolve(process.env.WEB_DIST_DIR);
  }

  return join(getApiRuntimeRoot(), "apps", "web", "dist");
}
