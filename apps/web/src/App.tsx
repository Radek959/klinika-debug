import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation
} from "react-router-dom";
import type { AuthenticatedUser } from "@klinika/api-contracts";
import { getCurrentUser, logout } from "./api/client";
import { clearToken, readToken } from "./auth/authStorage";
import { LoginPage } from "./auth/LoginPage";
import { DashboardPage } from "./dashboard/DashboardPage";
import { AppLayout } from "./layout/AppLayout";
import { PatientDetailsPage } from "./patients/PatientDetailsPage";
import { EditPatientPage, NewPatientPage } from "./patients/PatientFormPage";
import { PatientListPage } from "./patients/PatientListPage";

export function App() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const token = readToken();

  useEffect(() => {
    const storedToken = readToken();
    if (!storedToken) {
      setIsRestoringSession(false);
      return;
    }

    void getCurrentUser(storedToken)
      .then((response) => setUser(response.user))
      .catch(() => clearToken())
      .finally(() => setIsRestoringSession(false));
  }, []);

  async function handleLogout() {
    const storedToken = readToken();
    if (storedToken) {
      await logout(storedToken).catch(() => undefined);
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

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/" replace />
            ) : (
              <LoginPage onAuthenticated={setUser} />
            )
          }
        />
        <Route
          element={
            <RequireAuth user={user}>
              <AppLayout user={user as AuthenticatedUser} onLogout={handleLogout} />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage user={user as AuthenticatedUser} />} />
          <Route path="patients" element={<PatientListPage token={token ?? ""} />} />
          <Route path="patients/new" element={<NewPatientPage token={token ?? ""} />} />
          <Route
            path="patients/:patientId"
            element={<PatientDetailsPage token={token ?? ""} />}
          />
          <Route
            path="patients/:patientId/edit"
            element={<EditPatientPage token={token ?? ""} />}
          />
        </Route>
        <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function RequireAuth({
  user,
  children
}: {
  user: AuthenticatedUser | null;
  children: ReactElement;
}) {
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
