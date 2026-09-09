import { Link, useSearchParams } from "react-router-dom";
import { PageHeader } from "../layout/AppLayout";
import { CopyButton } from "../ui/CopyButton";
import { PRODUCT_DOCS_URL } from "./ProductDocsPage";
import { workshopLogs } from "./workshopLogs";

const OPENAPI_JSON_URL = "/api/docs-json";

async function fetchProductDocsMarkdown() {
  const response = await fetch(PRODUCT_DOCS_URL);
  if (!response.ok) {
    throw new Error("Nie udało się pobrać dokumentacji.");
  }
  return response.text();
}

type MaterialsTab = "logs" | "documentation";

function resolveMaterialsTab(rawTab: string | null): MaterialsTab {
  return rawTab === "documentation" ? "documentation" : "logs";
}

export function MaterialsPage() {
  const [searchParams] = useSearchParams();
  const activeTab = resolveMaterialsTab(searchParams.get("tab"));

  return (
    <>
      <PageHeader title="Materiały warsztatowe" />

      <nav className="materials-tabs" aria-label="Sekcje materiałów">
        <Link
          to="/materials?tab=logs"
          className={`materials-tab${activeTab === "logs" ? " active" : ""}`}
          aria-current={activeTab === "logs" ? "page" : undefined}
        >
          Logi aplikacji
        </Link>
        <Link
          to="/materials?tab=documentation"
          className={`materials-tab${activeTab === "documentation" ? " active" : ""}`}
          aria-current={activeTab === "documentation" ? "page" : undefined}
        >
          Dokumentacja
        </Link>
      </nav>

      {activeTab === "logs" ? <LogsTab /> : <DocumentationTab />}
    </>
  );
}

function LogsTab() {
  return (
    <section>
      <h2>Logi aplikacji</h2>
      <p>
        Logi są syntetycznym materiałem szkoleniowym. Możesz analizować je w
        przeglądarce, kopiować fragmenty lub pobrać plik.
      </p>
      <p className="muted">
        Możesz wkleić konkretny Correlation ID z aplikacji, aby odnaleźć powiązane wpisy.
      </p>

      <div className="materials-grid">
        {workshopLogs.map((material) => (
          <article className="material-card" key={material.id}>
            <h3>{material.title}</h3>
            <p>{material.description}</p>
            <div className="material-card-actions">
              <Link className="button-link" to={`/materials/logs/${material.id}`}>
                Podgląd
              </Link>
              <a
                className="secondary-link"
                href={`/materials/logs/${material.filename}`}
                download
              >
                Pobierz .log
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DocumentationTab() {
  return (
    <section>
      <h2>Dokumentacja</h2>

      <article className="material-card">
        <h3>Dokumentacja produktowa</h3>
        <p>Reguły biznesowe i oczekiwane zachowanie aplikacji.</p>
        <div className="material-card-actions">
          <Link className="button-link" to="/materials/product-docs">
            Podgląd
          </Link>
          <a
            className="secondary-link"
            href="/materials/docs/dokumentacja-produktowa.md"
            download
          >
            Pobierz .md
          </a>
          <CopyButton value={fetchProductDocsMarkdown} label="Kopiuj dokumentację" />
        </div>
      </article>

      <article className="material-card">
        <h3>Dokumentacja API</h3>
        <p>Kompletny opis endpointów REST dostępnych dla konta uczestnika.</p>
        <div className="material-card-actions">
          <a className="button-link" href="/api/docs" target="_blank" rel="noreferrer">
            Otwórz OpenAPI
          </a>
          <a className="secondary-link" href={OPENAPI_JSON_URL} target="_blank" rel="noreferrer">
            Pobierz OpenAPI JSON
          </a>
        </div>
      </article>
    </section>
  );
}
