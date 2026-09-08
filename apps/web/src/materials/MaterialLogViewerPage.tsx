import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../layout/AppLayout";
import { findWorkshopLogById } from "./workshopLogs";

export function MaterialLogViewerPage() {
  const { logId } = useParams<{ logId: string }>();
  const material = logId ? findWorkshopLogById(logId) : undefined;

  if (!material) {
    return (
      <>
        <PageHeader title="Materiał nie istnieje" />
        <p>Nie znaleziono materiału o podanym identyfikatorze.</p>
        <Link className="secondary-link" to="/materials">
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

  const entryCount = content ? content.split("\n").filter((line) => line.trim() !== "").length : null;

  return (
    <>
      <p className="breadcrumbs">
        <Link to="/materials">Materiały</Link> &gt; {title}
      </p>
      <PageHeader title={title} />

      {isLoading ? <p>Ładowanie logu...</p> : null}

      {error ? (
        <>
          <p className="form-error">Nie udało się załadować materiału.</p>
          <Link className="secondary-link" to="/materials">
            Wróć do materiałów
          </Link>
        </>
      ) : null}

      {!isLoading && !error && content !== null ? (
        <>
          <div className="log-viewer-toolbar">
            <div>
              <p className="log-viewer-filename">{filename}</p>
              <p className="muted">{entryCount} wpisów</p>
            </div>
            <a className="secondary-link" href={`/materials/logs/${filename}`} download>
              Pobierz .log
            </a>
          </div>
          <pre className="log-viewer">{content}</pre>
        </>
      ) : null}
    </>
  );
}

function isAbortError(caught: unknown) {
  return caught instanceof DOMException && caught.name === "AbortError";
}
