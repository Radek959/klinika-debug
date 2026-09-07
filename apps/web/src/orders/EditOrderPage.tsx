import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { MedicalTestCatalogItem, OrderDetailsResponse } from "@klinika/api-contracts";
import { ApiClientError, getOrder, updateOrder } from "../api/client";
import { PageHeader } from "../layout/AppLayout";
import { OrderForm, type OrderFormState } from "./OrderForm";
import {
  buildPatientListItemFromOrder,
  buildSelectedTestsFromOrder,
  buildUpdateOrderPayload,
  type OrderFormComparableState
} from "./orderFormState";

export function EditOrderPage({ token }: { token: string }) {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderDetailsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setIsLoading(false);
      setLoadError("Brak identyfikatora zlecenia.");
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setLoadError(null);
    void getOrder(token, orderId, controller.signal)
      .then((response) => setOrder(response))
      .catch((caught) =>
        setLoadError(toApiMessage(caught, "Nie udało się pobrać danych zlecenia."))
      )
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [orderId, token]);

  const initialState = useMemo<OrderFormState | undefined>(() => {
    if (!order) {
      return undefined;
    }
    return {
      selectedPatient: buildPatientListItemFromOrder(order),
      priority: order.priority,
      selectedTests: buildSelectedTestsFromOrder(order)
    };
  }, [order]);

  const initialComparable = useMemo<OrderFormComparableState | null>(() => {
    if (!order) {
      return null;
    }
    return {
      patientId: order.patientId,
      priority: order.priority,
      selectedTests: buildSelectedTestsFromOrder(order)
    };
  }, [order]);

  if (isLoading) {
    return <p className="muted">Ładowanie danych zlecenia...</p>;
  }

  if (loadError && !order) {
    return (
      <section className="empty-state" role="alert">
        <h1>Nie udało się wczytać zlecenia</h1>
        <p>{loadError}</p>
        <Link to="/orders">Wróć do listy</Link>
      </section>
    );
  }

  if (!order || !initialState || !initialComparable) {
    return null;
  }

  if (order.status !== "DRAFT") {
    return (
      <section className="empty-state" role="alert">
        <h1>Tego zlecenia nie można edytować</h1>
        <p>Edycja jest dostępna wyłącznie dla zleceń w statusie wersji roboczej.</p>
        <Link to={`/orders/${order.id}`}>Wróć do szczegółów</Link>
      </section>
    );
  }

  return (
    <>
      <PageHeader
        title={`Edycja zlecenia: ${order.patient.firstName} ${order.patient.lastName}`}
        actions={
          <Link className="secondary-link" to={`/orders/${order.id}`}>
            Wróć do szczegółów
          </Link>
        }
      />

      <OrderForm
        token={token}
        submitLabel="Zapisz zmiany"
        submittingLabel="Zapisywanie..."
        cancelTo={`/orders/${order.id}`}
        initialState={initialState}
        requireChanges
        hasChanges={(state, catalog) =>
          Boolean(buildPatch(initialComparable, state, catalog))
        }
        onSubmit={async (state, catalog) => {
          const payload = buildPatch(initialComparable, state, catalog);
          if (!payload) {
            return;
          }
          await updateOrder(token, order.id, payload);
          navigate(`/orders/${order.id}`, {
            state: { message: "Zlecenie zostało zaktualizowane." }
          });
        }}
      />
    </>
  );
}

function buildPatch(
  initial: OrderFormComparableState,
  state: OrderFormState,
  catalog: MedicalTestCatalogItem[]
) {
  if (!state.selectedPatient) {
    return null;
  }
  return buildUpdateOrderPayload({
    initial,
    current: {
      patientId: state.selectedPatient.id,
      priority: state.priority,
      selectedTests: state.selectedTests
    },
    catalog
  });
}

function toApiMessage(caught: unknown, fallback: string) {
  if (caught instanceof ApiClientError) {
    return caught.correlationId
      ? `${caught.message} Identyfikator błędu: ${caught.correlationId}`
      : caught.message;
  }
  return fallback;
}
