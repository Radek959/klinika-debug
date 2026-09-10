import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { createOrder, getPatient, listMedicalTests } from "../api/client";
import { PageHeader } from "../layout/AppLayout";
import { OrderForm, type OrderFormState } from "./OrderForm";
import { buildCreateOrderPayload } from "./orderFormState";

export function NewOrderPage({ token }: { token: string }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const patientId = searchParams.get("patientId");
  const [initialState, setInitialState] = useState<OrderFormState | undefined>(undefined);
  const [isLoadingPatient, setIsLoadingPatient] = useState(Boolean(patientId));

  useEffect(() => {
    if (!patientId) {
      setIsLoadingPatient(false);
      return;
    }

    const controller = new AbortController();
    setIsLoadingPatient(true);
    void getPatient(token, patientId, controller.signal)
      .then((patient) => {
        setInitialState({ selectedPatient: patient, priority: "ROUTINE", selectedTests: {} });
      })
      .catch(() => {
        // Nieprawidłowy albo niedostępny patientId (np. spoza workspace'u) —
        // formularz startuje bez wybranego pacjenta zamiast się wywrócić.
      })
      .finally(() => setIsLoadingPatient(false));

    return () => controller.abort();
  }, [patientId, token]);

  if (isLoadingPatient) {
    return <p className="muted">Ładowanie danych pacjenta...</p>;
  }

  return (
    <>
      <PageHeader
        title="Nowe zlecenie"
        actions={
          <Link className="secondary-link" to="/orders">
            Wróć do listy
          </Link>
        }
      />

      <OrderForm
        token={token}
        submitLabel="Utwórz zlecenie"
        submittingLabel="Zapisywanie..."
        cancelTo="/orders"
        initialState={initialState}
        onSubmit={async (state, catalog) => {
          if (!state.selectedPatient) {
            return;
          }
          // WORKSHOP CONTROLLED DEFECT (ORDER_PRIORITY_MAPPING): `catalogFlag`
          // is a deliberately opaque, unrelated-looking signal (see
          // tests-catalog.service.ts) — fetched fresh right before building
          // the request (not reused from the catalog loaded on mount), so a
          // controlled bug switched from `/admin` while this form was already
          // open takes effect on the very next submit, without a page reload.
          const { catalogFlag } = await listMedicalTests(token);
          const order = await createOrder(
            token,
            buildCreateOrderPayload({
              patientId: state.selectedPatient.id,
              priority: state.priority,
              catalog,
              selectedTests: state.selectedTests,
              invertUrgentPriority: catalogFlag
            })
          );
          navigate(`/orders/${order.id}`, {
            state: { message: "Zlecenie zostało utworzone." }
          });
        }}
      />
    </>
  );
}
