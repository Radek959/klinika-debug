import { Link } from "react-router-dom";
import { PageHeader } from "../layout/AppLayout";
import { workshopLogs } from "./workshopLogs";

export function MaterialsPage() {
  return (
    <>
      <PageHeader title="Materiały warsztatowe" />

      <section>
        <h2>Logi aplikacji</h2>
        <p>
          Logi są syntetycznym materiałem szkoleniowym. Możesz analizować je w
          przeglądarce, kopiować fragmenty lub pobrać plik.
        </p>
        <p className="muted">
          W logach możesz wyszukiwać m.in. <code>correlationId</code>.
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
          </div>
        </article>

        <article className="material-card">
          <h3>Dokumentacja API</h3>
          <p>Kompletny opis endpointów REST dostępnych dla konta uczestnika.</p>
          <div className="material-card-actions">
            <a className="button-link" href="/api/docs" target="_blank" rel="noreferrer">
              Otwórz OpenAPI
            </a>
          </div>
        </article>
      </section>
    </>
  );
}
