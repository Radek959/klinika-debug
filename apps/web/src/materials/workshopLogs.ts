/**
 * Jedyne źródło metadanych materiałów warsztatowych (logów) widocznych dla
 * uczestnika. Lista i strona podglądu korzystają wyłącznie z tego pliku, a
 * `logId` w adresie `/materials/logs/:logId` jest zawsze rozstrzygany przez tę
 * whitelistę — nigdy przez bezpośrednie zbudowanie ścieżki pliku z parametru
 * trasy.
 *
 * Rzeczywista treść logów pozostaje wyłącznie w `workshop-assets/logs/*.log`
 * (build-time kopiuje wybrane pliki do `apps/web/public/materials/logs/`).
 */
export interface WorkshopLogMaterial {
  id: string;
  filename: string;
  title: string;
  description: string;
}

export const workshopLogs: WorkshopLogMaterial[] = [
  {
    id: "happy-path",
    filename: "happy-path.log",
    title: "Przykładowy poprawny przebieg",
    description:
      "Przykładowy przebieg operacji pacjent → zlecenie → laboratorium → wynik."
  },
  {
    id: "patient-incident",
    filename: "patient-error.log",
    title: "Incydent — dane pacjenta",
    description: "Materiał diagnostyczny związany z operacją na danych pacjenta."
  },
  {
    id: "order-incident",
    filename: "order-flow.log",
    title: "Incydent — obsługa zlecenia",
    description: "Materiał diagnostyczny związany z procesem zlecenia i próbek."
  },
  {
    id: "lab-timeout",
    filename: "lab-timeout.log",
    title: "Incydent — komunikacja z laboratorium",
    description:
      "Materiał zawierający przebieg komunikacji z zewnętrznym laboratorium."
  },
  {
    id: "api-incident",
    filename: "api-diagnostics.log",
    title: "Incydent — API",
    description:
      "Materiał do analizy problemu występującego podczas obsługi zlecenia."
  },
  {
    id: "correlation-trace",
    filename: "correlation-trace.log",
    title: "Śledzenie procesu",
    description:
      "Kilka równoległych operacji, które można analizować przy pomocy correlationId."
  },
  {
    id: "production-like",
    filename: "production-like.log",
    title: "Log środowiska",
    description:
      "Większy, zaszumiony materiał zawierający wiele niezależnych operacji i zdarzeń."
  }
];

export function findWorkshopLogById(logId: string): WorkshopLogMaterial | undefined {
  return workshopLogs.find((material) => material.id === logId);
}
