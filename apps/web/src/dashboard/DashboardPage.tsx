import { Link } from "react-router-dom";
import type { AuthenticatedUser } from "@klinika/api-contracts";
import { PageHeader } from "../layout/AppLayout";

export function DashboardPage({ user }: { user: AuthenticatedUser }) {
  return (
    <>
      <PageHeader title="Panel główny">
        <p>Pracujesz w placówce: {user.workspace.name}.</p>
      </PageHeader>

      <section className="empty-state">
        <h2>Obsługa pacjentów</h2>
        <p>
          W tym etapie możesz przeglądać, tworzyć, edytować i dezaktywować
          syntetyczne rekordy pacjentów.
        </p>
        <Link className="button-link" to="/patients">
          Przejdź do pacjentów
        </Link>
      </section>
    </>
  );
}
