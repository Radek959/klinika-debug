import { PrismaClient } from "@prisma/client";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import * as argon2 from "argon2";
import { WorkshopConfigService } from "../src/workshop-config/workshop-config.service";
import { DEFAULT_CONTROLLED_BUG, type ControlledBug } from "../src/workshop-config/controlled-bug";
import type { LabSimulatorScenario } from "../src/lab-simulator/lab-simulator-scenario";

/**
 * Hasło i odpowiadający mu hash argon2id używane WYŁĄCZNIE w testach panelu
 * `/admin`. Nie jest to sekret produkcyjny — to syntetyczna wartość testowa,
 * analogiczna do `SEED_STAFF_PASSWORD`.
 */
export const TEST_ADMIN_PASSWORD = "AdminPanelTest123!";
export const TEST_ADMIN_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$rNHkJ6aCMcggJAoD+xaEZw$dk4Brk7dzp6r1Ch7dPeNfpCp1Fa28TCCSBhEPUoqHFQ";

export function configureTestEnvironment() {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL musi wskazywać oddzielną testową bazę MySQL."
    );
  }

  process.env.DATABASE_URL = databaseUrl;
  process.env.NODE_ENV ??= "test";
  process.env.PORT ??= "3000";
  process.env.SESSION_TOKEN_PEPPER ??= "test-session-pepper";
  process.env.LAB_WEBHOOK_SECRET ??= "test-lab-webhook-secret";
  process.env.ADMIN_PASSWORD_HASH ??= TEST_ADMIN_PASSWORD_HASH;
  process.env.ADMIN_SESSION_SECRET ??= "test-admin-session-secret-value";
  // Celowo nie natychmiastowe: testy sprawdzające status SENT_TO_LAB tuż po wysyłce
  // nie mogą być ścigane przez scheduler zanim zdąży wykonać asercję.
  process.env.LAB_SIMULATOR_DELAY_MS ??= "1000";
  process.env.LAB_SCHEDULER_POLL_INTERVAL_MS ??= "100";
}

export async function resetTestDatabase(prisma: PrismaClient) {
  // Konfiguracja warsztatu jest globalna i trwała (jeden wiersz), więc bez
  // tego czyszczenia wiersz utworzony przez jeden plik e2e (np. domyślny
  // scenariusz SUCCESS przy pierwszym wysłaniu zlecenia) przeciekałby do
  // kolejnych plików w tym samym uruchomieniu `--runInBand` i ignorował ich
  // `LAB_SIMULATOR_SCENARIO` — ten scenariusz jest odczytywany z env tylko
  // przy tworzeniu wiersza od nowa.
  await prisma.workshopConfig.deleteMany();
  await prisma.orderHistory.deleteMany();
  await prisma.processedLabEvent.deleteMany();
  await prisma.labJob.deleteMany();
  await prisma.result.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.sample.deleteMany();
  await prisma.orderTest.deleteMany();
  await prisma.order.deleteMany();
  await prisma.userSession.deleteMany();
  await prisma.guardian.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.medicalTestRequiredField.deleteMany();
  await prisma.testParameter.deleteMany();
  await prisma.medicalTest.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();
}

/**
 * Ustawia scenariusz symulatora laboratorium (i opcjonalnie kontrolowany
 * błąd) dla trwających testów e2e, poprawnie aktualizując zarówno wiersz
 * `workshop_config` w bazie, jak i cache w pamięci `WorkshopConfigService`.
 *
 * Testy pre-istniejące (sprzed `WorkshopConfigService`) historycznie
 * sterowały scenariuszem przez bezpośrednie przypisanie do
 * `process.env.LAB_SIMULATOR_SCENARIO`. Od PR #29/#30 `WorkshopConfigService`
 * cache'uje konfigurację w pamięci procesu na czas życia instancji aplikacji
 * Nest (tworzonej raz na plik testowy w `beforeAll`) — zmiana samej zmiennej
 * środowiskowej w trakcie działania pliku testowego jest więc cicho
 * ignorowana po pierwszym odczycie. Ta funkcja jest jedynym poprawnym
 * sposobem zmiany scenariusza (lub kontrolowanego błędu) w trakcie testu.
 */
export async function setWorkshopConfig(
  app: NestFastifyApplication,
  input: {
    labScenario: LabSimulatorScenario;
    controlledBug?: ControlledBug;
  }
) {
  const workshopConfigService = app.get(WorkshopConfigService);
  return workshopConfigService.setConfig({
    labScenario: input.labScenario,
    controlledBug: input.controlledBug ?? DEFAULT_CONTROLLED_BUG
  });
}

export async function createStaffUser(
  prisma: PrismaClient,
  input: {
    workspaceSlug: string;
    workspaceName: string;
    login: string;
    password: string;
  }
) {
  const workspace = await prisma.workspace.create({
    data: {
      slug: input.workspaceSlug,
      name: input.workspaceName
    }
  });

  const user = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      login: input.login,
      displayName: `Personel ${input.workspaceName}`,
      role: "STAFF",
      passwordHash: await argon2.hash(input.password, {
        type: argon2.argon2id
      })
    },
    include: {
      workspace: true
    }
  });

  return { workspace, user };
}

export async function createTestPatient(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    firstName: string;
    lastName: string;
    identifierType?: "PESEL" | "OTHER_DOCUMENT";
    pesel?: string;
    documentType?: string;
    documentNumber?: string;
    documentCountry?: string;
    birthDate?: string;
    gender?: "FEMALE" | "MALE";
    phone?: string;
    email?: string;
    active?: boolean;
  }
) {
  return prisma.patient.create({
    data: {
      workspaceId: input.workspaceId,
      firstName: input.firstName,
      lastName: input.lastName,
      identifierType: input.identifierType ?? "PESEL",
      pesel: input.pesel ?? null,
      documentType: input.documentType ?? null,
      documentNumber: input.documentNumber ?? null,
      documentCountry: input.documentCountry ?? null,
      birthDate: new Date(`${input.birthDate ?? "1990-01-01"}T00:00:00.000Z`),
      gender: input.gender ?? "FEMALE",
      phone: input.phone ?? null,
      email: input.email ?? null,
      active: input.active ?? true
    }
  });
}

export async function createTestOrder(
  prisma: PrismaClient,
  input: {
    workspaceId: string;
    patientId: string;
    createdByUserId: string;
    priority?: "ROUTINE" | "URGENT";
    status?:
      | "DRAFT"
      | "SAMPLE_COLLECTION_IN_PROGRESS"
      | "SAMPLE_COLLECTED"
      | "SENT_TO_LAB"
      | "PROCESSING"
      | "PARTIAL"
      | "COMPLETED"
      | "REJECTED"
      | "TECHNICAL_ERROR";
  }
) {
  return prisma.order.create({
    data: {
      workspaceId: input.workspaceId,
      patientId: input.patientId,
      createdByUserId: input.createdByUserId,
      priority: input.priority ?? "ROUTINE",
      status: input.status ?? "DRAFT"
    }
  });
}
