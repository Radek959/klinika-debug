import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../layout/AppLayout";
import { CopyButton } from "../ui/CopyButton";
import { findWorkshopLogById } from "./workshopLogs";

export function MaterialLogViewerPage() {
  const { logId } = useParams<{ logId: string }>();
  const material = logId ? findWorkshopLogById(logId) : undefined;

  if (!material) {
    return (
      <>
        <PageHeader title="Materiał nie istnieje" />
        <p>Nie znaleziono materiału o podanym identyfikatorze.</p>
        <Link className="secondary-link" to="/materials?tab=logs">
          Wróć do materiałów
        </Link>
      </>
    );
  }

  return <LoadedMaterialLogViewer filename={material.filename} title={material.title} />;
}

function LoadedMaterialLogViewer({
  filename,
  title
}: {
  filename: string;
  title: string;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setIsLoading(true);
    setError(false);

    void fetch(`/materials/logs/${filename}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Nie udało się pobrać materiału.");
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
  }, [filename]);

  const lines = useMemo(
    () => (content ? content.split("\n").filter((line) => line.trim() !== "") : []),
    [content]
  );
  const trimmedSearch = search.trim();
  const filteredLines = useMemo(() => {
    if (!trimmedSearch) {
      return lines;
    }
    const needle = trimmedSearch.toLowerCase();
    return lines.filter((line) => line.toLowerCase().includes(needle));
  }, [lines, trimmedSearch]);
  const visibleContent = filteredLines.join("\n");

  return (
    <>
      <p className="breadcrumbs">
        <Link to="/materials?tab=logs">Materiały</Link> &gt; {title}
      </p>
      <PageHeader title={title} />

      {isLoading ? <p>Ładowanie logu...</p> : null}

      {error ? (
        <>
          <p className="form-error">Nie udało się załadować materiału.</p>
          <Link className="secondary-link" to="/materials?tab=logs">
            Wróć do materiałów
          </Link>
        </>
      ) : null}

      {!isLoading && !error && content !== null ? (
        <>
          <div className="log-viewer-toolbar">
            <div>
              <p className="log-viewer-filename">{filename}</p>
              <p className="muted">
                {filteredLines.length} z {lines.length} wpisów
              </p>
            </div>
            <div className="log-viewer-toolbar-actions">
              <CopyButton value={content} label="Kopiuj cały log" />
              {trimmedSearch ? (
                <CopyButton value={visibleContent} label="Kopiuj wynik" />
              ) : null}
              <a className="secondary-link" href={`/materials/logs/${filename}`} download>
                Pobierz .log
              </a>
            </div>
          </div>

          <div className="log-viewer-search">
            <label htmlFor="log-search">Szukaj w logu</label>
            <input
              id="log-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Wpisz szukany tekst"
            />
            {search ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSearch("")}
              >
                Wyczyść
              </button>
            ) : null}
          </div>

          {trimmedSearch && filteredLines.length === 0 ? (
            <p className="muted">Brak wpisów pasujących do wyszukiwania.</p>
          ) : (
            <pre className="log-viewer">{visibleContent}</pre>
          )}
        </>
      ) : null}
    </>
  );
}

function isAbortError(caught: unknown) {
  return caught instanceof DOMException && caught.name === "AbortError";
}
