#!/usr/bin/env node
"use strict";

/**
 * Uruchomienie: `node scripts/copy-workshop-logs-web.cjs`
 *
 * Kopiuje jawnie zatwierdzone fixture'y logów warsztatowych z
 * `workshop-assets/logs/` do `apps/web/public/materials/logs/`, skąd Vite
 * publikuje je jako statyczne assety (`dist/materials/logs/*.log` po
 * `npm run build --workspace=@klinika/web`). Jest to część buildu frontendu
 * (`apps/web/package.json` → `build`), więc brakujący fixture zatrzymuje cały
 * build zamiast wdrożyć UI pokazujące materiał, którego nie ma w artefakcie.
 */

const { join } = require("node:path");
const { copyWorkshopLogsForWeb } = require("./workshop-logs-web-copy.cjs");

const sourceDir = join(__dirname, "..", "workshop-assets", "logs");
const destDir = join(__dirname, "..", "apps", "web", "public", "materials", "logs");

const copied = copyWorkshopLogsForWeb({ sourceDir, destDir });
console.log(`Skopiowano ${copied.length} materiałów logów warsztatowych do ${destDir}.`);
