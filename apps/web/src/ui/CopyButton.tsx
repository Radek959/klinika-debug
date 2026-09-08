import { useEffect, useState } from "react";

const CONFIRMATION_MS = 2000;

/**
 * Reużywalny przycisk kopiujący `value` do schowka (`navigator.clipboard`).
 * Po sukcesie etykieta zmienia się na „Skopiowano” i po chwili wraca do
 * oryginalnej treści.
 */
export function CopyButton({
  value,
  label = "Kopiuj"
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timeout = window.setTimeout(() => setCopied(false), CONFIRMATION_MS);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Schowek może być niedostępny (np. brak uprawnień przeglądarki) —
      // przycisk po prostu nie pokaże potwierdzenia.
    }
  }

  return (
    <button
      type="button"
      className="secondary-button copy-button"
      onClick={handleClick}
    >
      {copied ? "Skopiowano" : label}
    </button>
  );
}
