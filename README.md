# Klinika Debug

Klinika Debug is a training application created for the **Tester z AI** workshop. It simulates a laboratory order management system and provides a realistic environment for hands-on software testing with AI.

The main workflow is:

> patient → laboratory order → sample collection → laboratory processing → result or controlled failure

The repository is used during live training to practise:

* requirements analysis and test design with AI,
* test data generation,
* exploratory testing,
* REST API and DevTools investigation,
* log analysis with `correlationId`,
* bug reporting,
* building small QA tools with AI.

> [!WARNING]
> Klinika Debug is an educational system, not a medical product. Use synthetic data only. Do not enter real patient information or use generated results for medical decisions.

Created and maintained by **Radosław Wasik**.

🤖 **Looking for practical AI prompts for testing?**  
Explore the free [Prompt Hub for QA](https://prompty.rwasik.pl/) — a growing collection of prompts for requirements analysis, test design, exploratory testing, Playwright, code review, DevTools and more.

---

## Features

* 👤 **Patient Management** — Register, search, edit and deactivate synthetic patients
* 🧪 **Laboratory Orders** — Create and edit orders, select tests and calculate required samples
* 🧫 **Sample Collection** — Register samples and follow the order lifecycle
* 🔄 **Asynchronous Laboratory Flow** — Process complete and partial results, rejections, retries and technical errors
* 🕒 **Order History** — Review business events and trace operations with `correlationId`
* 🔌 **REST API** — Exercise the same workflows through a versioned API
* 📚 **OpenAPI Documentation** — Explore endpoints and contracts in the browser
* 🧑‍💻 **Isolated Workshop Accounts** — Give each participant an independent workspace
* 🐞 **Controlled Training Scenarios** — Reproduce deterministic integration failures and product defects
* 📄 **Synthetic Log Materials** — Investigate realistic, safe log fixtures directly in the application
* 🇵🇱 **Polish User Interface** — Work with a consistent Polish-language product UI

---

## Tech Stack

### Frontend

* React
* TypeScript
* Vite

### Backend

* NestJS
* Fastify
* TypeScript
* OpenAPI / Swagger

### Data and Tooling

* MySQL
* Prisma
* npm workspaces
* Jest, Vitest and Playwright
* GitHub Actions

---

## Prerequisites

Before running the application, install:

* Node.js 22 LTS or newer,
* npm,
* Git,
* Docker with Compose or a local MySQL 8 instance.

---

## Running Locally

Clone the repository and install dependencies:

```bash
git clone https://github.com/Radek959/klinika-debug.git
cd klinika-debug
npm install
```

Create the local environment file and start the databases:

```bash
cp .env.example .env
docker compose up -d mysql mysql-test
npm run db:generate
npm run db:migrate
npm run db:seed
```

On Windows PowerShell, use `Copy-Item .env.example .env` instead of `cp`.

Start the API:

```bash
npm run dev:api
```

Start the frontend in a second terminal:

```bash
npm run dev:web
```

Useful local addresses:

* **Application:** http://localhost:5173
* **API:** http://localhost:3001/api/v1
* **OpenAPI:** http://localhost:3001/api/docs
* **Liveness:** http://localhost:3001/health/live
* **Readiness:** http://localhost:3001/health/ready

Default synthetic local account:

```text
Login: staff.demo
Password: HasloTestowe123!
```

The default password is available only outside `NODE_ENV=production`. Production seeding requires an explicit `SEED_STAFF_PASSWORD`.

---

## Quality Checks

Run the standard pull request gate:

```bash
npm run verify:pr
```

It runs linting, type checking, automated tests and the production build. Database-backed integration tests and workshop smoke suites are documented separately.

---

## Documentation

* [Product documentation](./docs/dokumentacja-produktowa.md) (Polish) — expected business behaviour and validation rules
* [Workshop MVP specification](./docs/specyfikacja-mvp.md) (Polish) — workshop scope and requirements
* [Technical architecture](./docs/architektura-techniczna.md) (Polish) — architecture and technical decisions
* [Workshop environment operations](./docs/warsztat/workshop-readiness.md) (English) — deployment, participant setup, smoke tests, recovery and readiness checklists
* [Implementation status](./docs/implementation/README.md) (Polish) — implemented scope and project status

---

## Training Use

This repository is intended primarily for educational workshops and hands-on QA exercises. The standard `CLEAN` mode follows the product documentation, while trainer-controlled scenarios can introduce deterministic failures for investigation.

The participant-facing application does not expose trainer controls. Follow the trainer's instructions when using a shared workshop environment.

---

## About the Author

This project is created and maintained by **Radosław Wasik** — QA Tech Lead, trainer and software testing practitioner focused on test automation, Playwright and practical AI use in QA.

* 🌐 [rwasik.pl](https://rwasik.pl/)
* 💼 [LinkedIn](https://www.linkedin.com/in/rwasik/)
* 📸 [Instagram](https://instagram.com/radwasik)

---

## Usage

Klinika Debug is intended for educational, workshop and training purposes.
