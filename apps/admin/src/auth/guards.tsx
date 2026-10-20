import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './auth-context';
import { type ModuleId, MODULES } from './modules';
import { ForbiddenPage } from '../pages/status-pages';

export function RequireAuth() {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function RequireModule({ id, children }: { id: ModuleId; children: React.ReactNode }) {
  const { role } = useAuth();
  const mod = MODULES.find((m) => m.id === id);
  if (!role || !mod?.roles.includes(role)) return <ForbiddenPage />;
  return <>{children}</>;
}
