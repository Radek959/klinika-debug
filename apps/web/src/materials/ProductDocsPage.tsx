import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../layout/AppLayout";

const PRODUCT_DOCS_URL = "/materials/docs/dokumentacja-produktowa.md";

/**
 * Podgląd dokumentacji produktowej wprost z jej jedynego źródła
 * (`docs/dokumentacja-produktowa.md`, skopiowanego przez build do
 * `/materials/docs/`). Treść jest Markdownem wyświetlonym jako czytelny
 * tekst — bez renderowania HTML, bez nowej zależności.
 */
export function ProductDocsPage() {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const requestId = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setIsLoading(true);
    setError(false);

    void fetch(PRODUCT_DOCS_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Nie udało się pobrać dokumentacji.");
        }
        return response.text();
      })
      .then((text) => {
        if (requestId.current === currentRequest) {
          setContent(text);
        }
      })
      .catch((caught) => {
        if (requestId.current !== currentRequest || isAbortError(caught)) {
          return;
        }
        setError(true);
      })
      .finally(() => {
        if (requestId.current === currentRequest) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, []);

  return (
    <>
      <p className="breadcrumbs">
        <Link to="/materials?tab=documentation">Materiały</Link> &gt; Dokumentacja produktowa
      </p>
      <PageHeader
        title="Dokumentacja produktowa"
        actions={
          <a className="secondary-link" href={PRODUCT_DOCS_URL} download>
            Pobierz .md
          </a>
        }
      />

      {isLoading ? <p>Ładowanie dokumentacji...</p> : null}

      {error ? (
        <>
          <p className="form-error">Nie udało się załadować dokumentacji.</p>
          <Link className="secondary-link" to="/materials">
            Wróć do materiałów
          </Link>
        </>
      ) : null}

      {!isLoading && !error && content !== null ? (
        <pre className="product-docs-preview">{content}</pre>
      ) : null}
    </>
  );
}

function isAbortError(caught: unknown) {
  return caught instanceof DOMException && caught.name === "AbortError";
}
