#!/usr/bin/env node
"use strict";

/**
 * Uruchomienie: `node scripts/copy-workshop-docs-web.cjs`
 *
 * Kopiuje `docs/dokumentacja-produktowa.md` do
 * `apps/web/public/materials/docs/`, skąd Vite publikuje ją jako statyczny
 * asset (`dist/materials/docs/dokumentacja-produktowa.md` po
 * `npm run build --workspace=@klinika/web`). Jest to część buildu frontendu
 * (`apps/web/package.json` → `build`), więc zniknięcie dokumentu źródłowego
 * zatrzymuje cały build zamiast wdrożyć zakładkę Materiały bez dokumentacji.
 */

const { join } = require("node:path");
const { copyProductDocsForWeb } = require("./workshop-docs-web-copy.cjs");

const sourceDir = join(__dirname, "..", "docs");
const destDir = join(__dirname, "..", "apps", "web", "public", "materials", "docs");

const copied = copyProductDocsForWeb({ sourceDir, destDir });
console.log(`Skopiowano dokumentację produktową (${copied}) do ${destDir}.`);
