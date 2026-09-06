import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import type { AuthenticatedUser } from "@klinika/api-contracts";

interface AppLayoutProps {
  user: AuthenticatedUser;
  onLogout: () => void;
}

export function AppLayout({ user, onLogout }: AppLayoutProps) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="product-label">Klinika Debug</p>
          <p className="workspace-name">{user.workspace.name}</p>
        </div>
        <div className="user-box">
          <span>{user.displayName}</span>
          <button type="button" className="secondary-button" onClick={onLogout}>
            Wyloguj
          </button>
        </div>
      </header>

      <div className="app-body">
        <nav className="side-nav" aria-label="Nawigacja główna">
          <NavLink to="/" end>
            Panel główny
          </NavLink>
          <NavLink to="/patients">Pacjenci</NavLink>
          <NavLink to="/orders">Zlecenia</NavLink>
        </nav>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  actions,
  children
}: {
  title: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {children}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
