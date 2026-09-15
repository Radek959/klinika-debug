# Workshop Environment Operations

**Purpose:** prepare, verify and recover the deployed Klinika Debug environment for the **Tester z AI** workshop.  
**Audience:** project owner and workshop trainer. This is an operational runbook, not participant documentation, and it does not contain passwords.

Klinika Debug uses synthetic data only. Never place production secrets, real patient data or real medical information in the repository, fixtures or workshop environment.

## 1. What This Runbook Covers

This document describes:

* Hostinger deployment commands,
* participant workspace provisioning,
* remote workshop smoke tests,
* the optional local Playwright smoke suite,
* pre-workshop readiness checks,
* environment reset and recovery,
* technical quality gates.

The workshop teaching flow is documented separately in [`przebieg-szkolenia.md`](./przebieg-szkolenia.md).

## 2. Hostinger Deployment

Use the following settings for the Hostinger `Other` framework:

```text
Package manager: npm
Output directory: ./
Entry file: apps/api/dist/main.js
```

### Standard deployment

```bash
npm run build:hostinger
```

This command generates the Prisma client, builds the application and runs `prisma migrate deploy`. It never creates or resets workshop accounts.

### Deployment with explicit workshop preparation

When the hosting panel accepts a custom build command, use:

```bash
npm run build:hostinger:workshop
```

It runs the standard Hostinger build and then `npm run workshop:prepare`.

### First deployment or restricted hosting panels

If the panel only allows a fixed build command, use:

```bash
npm run build:hostinger:seed
```

This additionally runs `db:seed` and `workshop:prepare`. Both operations are idempotent: they use upserts and do not overwrite participant data when repeated. This variant requires both `SEED_STAFF_PASSWORD` and `WORKSHOP_STAFF_PASSWORD` in the production environment.

## 3. Workshop Environment Configuration

Set the required values in the deployment environment. Refer to [`.env.example`](../../.env.example) for the complete list and safe descriptions.

```text
WORKSHOP_PARTICIPANTS=15
WORKSHOP_STAFF_PASSWORD=...
ADMIN_PASSWORD_HASH=...
ADMIN_SESSION_SECRET=...
```

Do not commit real values. `WORKSHOP_STAFF_PASSWORD` is shared by the synthetic `testerNN` accounts. The trainer panel password corresponds to `ADMIN_PASSWORD_HASH` and must remain known only to the trainer.

## 4. Preparing Participant Workspaces

Workshop preparation is an explicit operation and is not part of a standard deployment:

```bash
npm run workshop:prepare
```

The command:

* reads the participant count from `WORKSHOP_PARTICIPANTS` (default: 15),
* creates `tester01` through `testerNN`,
* creates one isolated `warsztat-NN` workspace per participant,
* validates required configuration,
* uses the shared provisioning mechanism also used by `workshop:seed`,
* is idempotent and never resets existing participant data,
* never prints passwords, password hashes, tokens or secrets.

The default model is:

> one participant = one `STAFF` account = one isolated workspace

## 5. Recommended Pre-Workshop Sequence

Run this sequence the day before the workshop:

```text
1. Deploy the application.
2. Run workshop:prepare unless build:hostinger:workshop already did it.
3. Run the read-only remote smoke preflight.
4. Run the confirmed full remote smoke.
5. Complete the manual UI smoke checklist.
6. Reset the workshop environment.
7. Confirm SUCCESS, CLEAN and the expected laboratory delay in the trainer panel.
```

The final reset should happen after all verification and before participants enter the environment.

## 6. Remote Workshop Smoke Test

`npm run workshop:smoke` targets the actually deployed application. It covers health checks, participant authentication, workspace isolation, the patient-to-result workflow, controlled scenarios, OpenAPI and workshop assets.

Configure the runner outside the repository:

```text
WORKSHOP_BASE_URL=https://klinikadebug.rwasik.pl
WORKSHOP_STAFF_PASSWORD=...
WORKSHOP_ADMIN_PASSWORD=...
```

`WORKSHOP_ADMIN_PASSWORD` is used only by the smoke runner. It is the plain-text password corresponding to `ADMIN_PASSWORD_HASH`. Never commit or print it.

### Read-only preflight

Without explicit confirmation, the runner checks only read-only resources such as health endpoints, current trainer configuration, OpenAPI and workshop materials:

```bash
npm run workshop:smoke
```

### Full smoke

The full smoke logs in participant accounts, resets data, exercises the main workflow and controlled failures, and performs cleanup. It requires explicit confirmation because it changes workshop data.

macOS and Linux:

```bash
WORKSHOP_SMOKE_CONFIRM=RUN npm run workshop:smoke
```

Windows PowerShell:

```powershell
$env:WORKSHOP_SMOKE_CONFIRM = "RUN"
npm run workshop:smoke
```

The runner prints the target host before starting and never logs passwords, tokens or cookies. In its final cleanup it attempts to restore `SUCCESS`, `CLEAN` and reset workshop data, even if an earlier step fails.

Expected exit codes:

* `0` — every required step passed,
* `1` — at least one step failed.

If cleanup fails, use the emergency clean-state procedure in section 10.

### Testing the smoke runner itself

The runner's tests use a mock HTTP server and do not access a deployed environment:

```bash
npm run test:workshop-smoke
```

## 7. Optional Local Playwright Smoke

`npm run test:workshop-browser` is an additional manual quality gate for the participant-facing browser flow. It is not required for every pull request and does not run in CI.

The suite is intentionally restricted to a local application. `WORKSHOP_BROWSER_BASE_URL` must point to `localhost`, `127.0.0.1` or `::1`; otherwise it fails before sending a request. It must never target Hostinger or use `WORKSHOP_BASE_URL`.

Prepare and start the local production build:

```bash
npm run build
npm start
```

Configure the local test process:

```text
WORKSHOP_STAFF_PASSWORD=...
WORKSHOP_ADMIN_PASSWORD=...
WORKSHOP_E2E_CONFIRM=RUN
# Optional when the application does not use the default URL:
# WORKSHOP_BROWSER_BASE_URL=http://localhost:XXXX
```

Run the suite:

macOS and Linux:

```bash
WORKSHOP_E2E_CONFIRM=RUN npm run test:workshop-browser
```

Windows PowerShell:

```powershell
$env:WORKSHOP_E2E_CONFIRM = "RUN"
npm run test:workshop-browser
```

The suite is serial because trainer configuration is global. Its setup resets the environment and then applies `SUCCESS`, `CLEAN` and a five-second laboratory delay. Cleanup resets data and restores the standard five-minute delay.

On failure, Playwright retains a screenshot and trace. If cleanup cannot complete, the suite clearly reports that a manual reset is required.

## 8. Manual UI Smoke Checklist

Complete this checklist against the final deployed environment:

```text
[ ] participant login
[ ] patient list
[ ] create patient
[ ] edit patient
[ ] create order
[ ] register samples
[ ] send order to laboratory
[ ] order history
[ ] laboratory result
[ ] DevTools request and response
[ ] correlationId
[ ] trainer panel login
[ ] controlled scenario
[ ] participant reset
[ ] full environment reset
[ ] Materials page
[ ] log preview
[ ] .log download
```

## 9. Final 30-Minute Checklist

Thirty minutes before the workshop, confirm:

* [ ] `GET /health/live` returns `status: ok`
* [ ] `GET /health/ready` returns `status: ok`
* [ ] `tester01` can sign in
* [ ] the trainer can sign in to `/admin`
* [ ] `/api/docs` is available
* [ ] log fixtures are available from **Materiały** (`/materials`)
* [ ] the laboratory scenario is `SUCCESS`
* [ ] the controlled defect is `CLEAN`
* [ ] the laboratory delay matches the workshop plan

## 10. Recovery

### Reset one participant

In `/admin`, use **Reset uczestnika** and select the relevant `testerNN` / `warsztat-NN` workspace. This resets only that participant's business data and invalidates only that participant's session. The participant signs in again with the same credentials.

Other workspaces and global trainer configuration are not changed.

### Reset all participants

Use **Resetuj środowisko** in `/admin`, or run:

```bash
npm run workshop:reset
```

This resets every `warsztat-NN` workspace, invalidates participant sessions and restores `SUCCESS`, `CLEAN` and the standard five-minute laboratory delay. It does not reset the `klinika-pokazowa` workspace.

### Emergency clean state

When the environment is inconsistent or the smoke cleanup failed:

```text
1. Set labScenario to SUCCESS in /admin.
2. Set controlledBug to CLEAN in /admin.
3. Reset the full workshop environment in /admin or with workshop:reset.
4. Confirm the expected laboratory delay.
5. Ask participants to sign in again when prompted.
```

The participant frontend redirects expired sessions to `/login` automatically after the next request.

## 11. Standard Quality Gates

The pull request Definition of Done is:

```bash
npm run verify:pr
```

It runs linting, type checking, automated tests and the build. It does not require a database, Chromium or destructive workshop confirmation.

Database-backed API integration tests require an isolated MySQL database through `TEST_DATABASE_URL`:

macOS and Linux:

```bash
TEST_DATABASE_URL="mysql://klinika:klinika_local_password@localhost:3307/klinika_debug_test" npm run db:migrate:test
TEST_DATABASE_URL="mysql://klinika:klinika_local_password@localhost:3307/klinika_debug_test" npm run test:integration
```

Windows PowerShell:

```powershell
$env:TEST_DATABASE_URL = "mysql://klinika:klinika_local_password@localhost:3307/klinika_debug_test"
npm run db:migrate:test
npm run test:integration
```

Production-start smoke requires a completed build and the same isolated test database:

```bash
npm run build
TEST_DATABASE_URL="mysql://klinika:klinika_local_password@localhost:3307/klinika_debug_test" npm run test:production-start
```

GitHub Actions provides MySQL and runs the required database-backed checks when a local MySQL or Docker environment is not available.

## 12. Readiness Evidence and Status

The repository includes implemented support for:

* isolated participant workspaces and deterministic provisioning,
* the complete patient → order → samples → laboratory → result workflow,
* partial results, rejections, retries and technical errors,
* trainer-controlled laboratory scenarios and reversible defects,
* OpenAPI, consistent errors and `correlationId`,
* realistic synthetic log fixtures,
* automated remote smoke and optional local browser smoke,
* environment reset and recovery.

Use status labels precisely:

* **IMPLEMENTED** — code and tests exist in the repository,
* **VERIFIED** — required tests, CI and review have passed,
* **DEPLOYED** — the target environment has been deployed and checked successfully.

Green CI verifies the codebase; it does not prove that the current Hostinger environment is ready for a workshop. Mark the environment as **DEPLOYED** only after all of the following have succeeded:

1. Hostinger deployment,
2. participant preparation,
3. confirmed full remote smoke with `RESULT: PASS`,
4. manual UI smoke,
5. final environment reset and configuration check.
