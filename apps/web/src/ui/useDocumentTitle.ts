import { useEffect } from "react";

/** Ustawia tytuł karty przeglądarki na czas życia widoku. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
