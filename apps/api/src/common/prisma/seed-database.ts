import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { readPeselData } from "@klinika/domain";

const seedPatients = [
  {
    firstName: "Jan",
    lastName: "Nowak-Testowy",
    identifierType: "PESEL" as const,
    pesel: "44051401458",
    citizenship: "PL",
    phone: "+48123123123",
    email: "jan.nowak.test@example.test",
    addressCity: "Warszawa",
    addressCountry: "PL"
  },
  {
    firstName: "Anna",
    lastName: "Kowalska",
    identifierType: "PESEL" as const,
    pesel: "02270803624",
    citizenship: "PL",
    phone: "123123124",
    email: "anna.kowalska@example.test",
    addressCity: "Kraków",
    addressCountry: "PL"
  },
  {
    firstName: "Maja",
    lastName: "Syntetyczna",
    identifierType: "PESEL" as const,
    pesel: "18210112349",
    citizenship: "PL",
    phone: "+48123123125",
    email: "maja.syntetyczna@example.test",
    addressCity: "Gdańsk",
    addressCountry: "PL",
    guardian: {
      firstName: "Karolina",
      lastName: "Syntetyczna",
      phone: "+48123123126",
      email: "karolina.syntetyczna@example.test"
    }
  },
  {
    firstName: "Alex",
    lastName: "Demo",
    identifierType: "OTHER_DOCUMENT" as const,
    documentType: "PASSPORT",
    documentNumber: "XD1234567",
    documentCountry: "CZ",
    birthDate: "1988-03-12",
    gender: "MALE" as const,
    citizenship: "CZ",
    phone: "+48123123127",
    email: "alex.demo@example.test",
    addressCity: "Poznań",
    addressCountry: "PL"
  }
] as const;

export async function seedDatabase(client: PrismaClient) {
  const seedPassword = getSeedStaffPassword();
  const workspace = await client.workspace.upsert({
    where: { slug: "klinika-pokazowa" },
    update: { name: "Klinika Pokazowa" },
    create: {
      name: "Klinika Pokazowa",
      slug: "klinika-pokazowa"
    }
  });

  const passwordHash = await argon2.hash(seedPassword, {
    type: argon2.argon2id
  });

  await client.user.upsert({
    where: { login: "staff.demo" },
    update: {
      workspaceId: workspace.id,
      displayName: "Personel pokazowy",
      role: "STAFF",
      passwordHash,
      active: true
    },
    create: {
      workspaceId: workspace.id,
      login: "staff.demo",
      displayName: "Personel pokazowy",
      role: "STAFF",
      passwordHash,
      active: true
    }
  });

  await seedDemoPatients(client, workspace.id);
}

async function seedDemoPatients(client: PrismaClient, workspaceId: string) {
  for (const patient of seedPatients) {
    const savedPatient = await client.patient.upsert({
      where: getSeedPatientWhere(workspaceId, patient),
      update: {},
      create: {
        workspaceId,
        firstName: patient.firstName,
        lastName: patient.lastName,
        identifierType: patient.identifierType,
        pesel: patient.identifierType === "PESEL" ? patient.pesel : null,
        documentType:
          patient.identifierType === "OTHER_DOCUMENT"
            ? patient.documentType
            : null,
        documentNumber:
          patient.identifierType === "OTHER_DOCUMENT"
            ? patient.documentNumber
            : null,
        documentCountry:
          patient.identifierType === "OTHER_DOCUMENT"
            ? patient.documentCountry
            : null,
        birthDate: new Date(`${readSeedBirthDate(patient)}T00:00:00.000Z`),
        gender: readSeedGender(patient),
        citizenship: patient.citizenship,
        phone: patient.phone,
        email: patient.email,
        addressCity: patient.addressCity,
        addressCountry: patient.addressCountry
      }
    });

    if ("guardian" in patient) {
      await client.guardian.upsert({
        where: { patientId: savedPatient.id },
        update: {},
        create: {
          workspaceId,
          patientId: savedPatient.id,
          firstName: patient.guardian.firstName,
          lastName: patient.guardian.lastName,
          phone: patient.guardian.phone,
          email: patient.guardian.email
        }
      });
    }
  }
}

function getSeedPatientWhere(
  workspaceId: string,
  patient: (typeof seedPatients)[number]
) {
  if (patient.identifierType === "PESEL") {
    return {
      workspaceId_pesel: {
        workspaceId,
        pesel: patient.pesel
      }
    };
  }

  return {
    workspaceId_documentType_documentNumber_documentCountry: {
      workspaceId,
      documentType: patient.documentType,
      documentNumber: patient.documentNumber,
      documentCountry: patient.documentCountry
    }
  };
}

function readSeedBirthDate(patient: (typeof seedPatients)[number]) {
  if (patient.identifierType === "OTHER_DOCUMENT") {
    return patient.birthDate;
  }

  const peselData = readPeselData(patient.pesel);
  if (!peselData) {
    throw new Error("Seed zawiera niepoprawny numer PESEL.");
  }

  return peselData.birthDate;
}

function readSeedGender(patient: (typeof seedPatients)[number]) {
  if (patient.identifierType === "OTHER_DOCUMENT") {
    return patient.gender;
  }

  const peselData = readPeselData(patient.pesel);
  if (!peselData) {
    throw new Error("Seed zawiera niepoprawny numer PESEL.");
  }

  return peselData.gender;
}

export function getSeedStaffPassword(): string {
  const password = process.env.SEED_STAFF_PASSWORD;
  if (password) {
    return password;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SEED_STAFF_PASSWORD jest wymagane podczas produkcyjnego seedowania."
    );
  }

  return "HasloTestowe123!";
}
