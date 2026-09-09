import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PageHeader } from "../layout/AppLayout";

const PRODUCT_DOCS_URL = "/materials/docs/dokumentacja-produktowa.md";
const FALLBACK_TITLE = "Dokumentacja produktowa";

/**
 * Dokument zaczyna się od własnego `# ...` (H1), a strona ma już własny
 * nagłówek `PageHeader` — bez tego dwa H1 wyświetlałyby się jeden pod
 * drugim. To CELOWO nie jest parser Markdown: tylko bardzo małe, bezpieczne
 * wykrycie wiodącej linii `# ...` (z dopuszczalnymi wiodącymi pustymi
 * liniami), które staje się tytułem `PageHeader`, a reszta treści nadal
 * trafia w całości do `react-markdown`. Brak wiodącego H1 → fallback
 * `FALLBACK_TITLE`, treść renderowana bez zmian.
 */
function extractLeadingHeading(markdown: string): { title: string; rest: string } {
  const match = markdown.match(/^\s*#\s+(.+?)\s*\r?\n/);
  if (!match) {
    return { title: FALLBACK_TITLE, rest: markdown };
  }
  return { title: match[1].trim() || FALLBACK_TITLE, rest: markdown.slice(match[0].length) };
}

/** Tabela w osobnym, poziomo przewijalnym kontenerze — nie rozwala layoutu na wąskich ekranach. */
const MARKDOWN_COMPONENTS = {
  table: ({ children }: { children?: ReactNode }) => (
    <div className="product-docs-table-wrap">
      <table>{children}</table>
    </div>
  )
};

/**
 * Podgląd dokumentacji produktowej wprost z jej jedynego źródła
 * (`docs/dokumentacja-produktowa.md`, skopiowanego przez build do
 * `/materials/docs/`). Treść jest Markdownem renderowanym jako zwykła
 * dokumentacja (`react-markdown` + `remark-gfm` dla tabel) — celowo BEZ
 * `rehype-raw`, więc surowy HTML z dokumentu nigdy nie jest wykonywany.
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

  const { title, rest } = useMemo(
    () => (content !== null ? extractLeadingHeading(content) : { title: FALLBACK_TITLE, rest: "" }),
    [content]
  );

  return (
    <>
      <p className="breadcrumbs">
        <Link to="/materials?tab=documentation">Materiały</Link> &gt; Dokumentacja produktowa
      </p>
      <PageHeader
        title={title}
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
          <Link className="secondary-link" to="/materials?tab=documentation">
            Wróć do materiałów
          </Link>
        </>
      ) : null}

      {!isLoading && !error && content !== null ? (
        <div className="product-docs-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {rest}
          </ReactMarkdown>
        </div>
      ) : null}
    </>
  );
}

function isAbortError(caught: unknown) {
  return caught instanceof DOMException && caught.name === "AbortError";
}
