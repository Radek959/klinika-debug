import { Link, useNavigate } from "react-router-dom";
import { createOrder } from "../api/client";
import { PageHeader } from "../layout/AppLayout";
import { OrderForm } from "./OrderForm";
import { buildCreateOrderPayload } from "./orderFormState";

export function NewOrderPage({ token }: { token: string }) {
  const navigate = useNavigate();

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
        onSubmit={async (state, catalog) => {
          if (!state.selectedPatient) {
            return;
          }
          const order = await createOrder(
            token,
            buildCreateOrderPayload({
              patientId: state.selectedPatient.id,
              priority: state.priority,
              catalog,
              selectedTests: state.selectedTests
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
