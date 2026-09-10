import { FormEvent, useState } from "react";
import { ApiClientError, login } from "../api/client";
import { saveToken } from "./authStorage";
import { useDocumentTitle } from "../ui/useDocumentTitle";
import type { AuthenticatedUser } from "@klinika/api-contracts";

interface LoginPageProps {
  onAuthenticated: (user: AuthenticatedUser) => void;
  sessionExpired?: boolean;
}

export function LoginPage({ onAuthenticated, sessionExpired = false }: LoginPageProps) {
  useDocumentTitle("Logowanie • Klinika Debug");
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await login(loginName, password);
      saveToken(response.token);
      // Dokąd trafimy po zalogowaniu decyduje `App` (`AuthenticatedRedirect`)
      // na podstawie `location.state.from` i flagi `sessionExpired` — stąd,
      // a nie stąd, żeby uniknąć wyścigu dwóch niezależnych nawigacji: tej
      // strony i automatycznego przekierowania z trasy `/login`, gdy
      // użytkownik jest już zalogowany.
      onAuthenticated(response.user);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.correlationId) {
        setError(`${caught.message} Identyfikator: ${caught.correlationId}`);
      } else if (caught instanceof Error) {
        setError(caught.message);
      } else {
        setError("Nie udało się zalogować.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div>
          <p className="product-label">Klinika Debug</p>
          <h1 id="login-title">Logowanie</h1>
          <p className="login-copy">
            Zaloguj się na syntetyczne konto personelu placówki.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {sessionExpired ? (
            <p className="form-error" role="status">
              Sesja wygasła. Zaloguj się ponownie.
            </p>
          ) : null}

          <label>
            Login
            <input
              autoComplete="username"
              name="login"
              value={loginName}
              onChange={(event) => setLoginName(event.target.value)}
              required
            />
          </label>

          <label>
            Hasło
            <input
              autoComplete="current-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Logowanie..." : "Zaloguj"}
          </button>
        </form>
      </section>
    </main>
  );
}
