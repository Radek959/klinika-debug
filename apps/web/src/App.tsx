import { useEffect, useState } from "react";
import type { AuthenticatedUser } from "@klinika/api-contracts";
import { getCurrentUser, logout } from "./api/client";
import { clearToken, readToken } from "./auth/authStorage";
import { LoginPage } from "./auth/LoginPage";

export function App() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  useEffect(() => {
    const token = readToken();
    if (!token) {
      setIsRestoringSession(false);
      return;
    }

    void getCurrentUser(token)
      .then((response) => setUser(response.user))
      .catch(() => clearToken())
      .finally(() => setIsRestoringSession(false));
  }, []);

  async function handleLogout() {
    const token = readToken();
    if (token) {
      await logout(token).catch(() => undefined);
    }
    clearToken();
    setUser(null);
  }

  if (isRestoringSession) {
    return (
      <main className="loading-page">
        <p>Odtwarzanie sesji...</p>
      </main>
    );
  }

  if (!user) {
    return <LoginPage onAuthenticated={setUser} />;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="product-label">Klinika Debug</p>
          <h1>Panel główny</h1>
        </div>
        <button type="button" className="secondary-button" onClick={handleLogout}>
          Wyloguj
        </button>
      </header>

      <section className="workspace-summary">
        <p>Zalogowany użytkownik</p>
        <strong>{user.displayName}</strong>
        <span>{user.workspace.name}</span>
      </section>
    </main>
  );
}
