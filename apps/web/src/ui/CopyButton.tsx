import { useEffect, useState } from "react";

const CONFIRMATION_MS = 2000;

/**
 * Reużywalny przycisk kopiujący do schowka (`navigator.clipboard`). `value`
 * może być gotowym tekstem albo funkcją pobierającą go leniwie (np. treść
 * dokumentu pobrana dopiero po kliknięciu) — w obu przypadkach po sukcesie
 * etykieta zmienia się na „Skopiowano” i po chwili wraca do oryginalnej
 * treści.
 */
export function CopyButton({
  value,
  label = "Kopiuj"
}: {
  value: string | (() => Promise<string>);
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
      const text = typeof value === "function" ? await value() : value;
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Schowek może być niedostępny (np. brak uprawnień przeglądarki) albo
      // pobranie treści mogło się nie powieść — przycisk po prostu nie
      // pokaże potwierdzenia.
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
