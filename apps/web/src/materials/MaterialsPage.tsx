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
    </>
  );
}
