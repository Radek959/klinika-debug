import type {
  MedicalTestCatalogItem,
  OrderPriority,
  PatientListItem
} from "@klinika/api-contracts";
import { formatDateOnly } from "../ui/dates";
import { materialTypeLabels, orderPriorityLabels } from "../ui/labels";
import {
  getRequiredMaterials,
  getSelectedCatalogItems,
  maskPatientIdentifier,
  patientDisplayName,
  type SelectedOrderTests
} from "./orderFormState";

interface OrderSummaryProps {
  selectedPatient: PatientListItem | null;
  priority: OrderPriority;
  catalog: MedicalTestCatalogItem[];
  selectedTests: SelectedOrderTests;
}

export function OrderSummary({
  selectedPatient,
  priority,
  catalog,
  selectedTests
}: OrderSummaryProps) {
  const selectedCatalogItems = getSelectedCatalogItems(catalog, selectedTests);
  const requiredMaterials = getRequiredMaterials(catalog, selectedTests);

  return (
    <section className="order-summary" aria-labelledby="order-summary-title">
      <h2 id="order-summary-title">Podsumowanie zlecenia</h2>
      <dl className="order-summary-grid">
        <div>
          <dt>Pacjent</dt>
          <dd>
            {selectedPatient ? (
              <>
                <strong>{patientDisplayName(selectedPatient)}</strong>
                <span>
                  Data urodzenia: {formatDateOnly(selectedPatient.birthDate)} ·{" "}
                  {maskPatientIdentifier(selectedPatient)}
                </span>
              </>
            ) : (
              "Nie wybrano"
            )}
          </dd>
        </div>
        <div>
          <dt>Priorytet</dt>
          <dd>{orderPriorityLabels[priority]}</dd>
        </div>
        <div>
          <dt>Badania</dt>
          <dd>
            {selectedCatalogItems.length > 0 ? (
              <>
                <span>Liczba badań: {selectedCatalogItems.length}</span>
                <ul className="order-summary-list">
                  {selectedCatalogItems.map((test) => (
                    <li key={test.id}>
                      {test.name} ({test.code})
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              "Nie wybrano"
            )}
          </dd>
        </div>
        <div>
          <dt>Wymagane próbki</dt>
          <dd>
            {requiredMaterials.length > 0 ? (
              <ul className="order-summary-list">
                {requiredMaterials.map((materialType) => (
                  <li key={materialType}>{materialTypeLabels[materialType]}</li>
                ))}
              </ul>
            ) : (
              "Zostaną wyliczone po wybraniu badań"
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
