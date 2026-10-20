import { Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider, useAuth } from './auth/auth-context';
import { RequireAuth, RequireModule } from './auth/guards';
import { homePath, MODULES, type ModuleId } from './auth/modules';
import { ToastProvider } from './components/toast';
import { Shell } from './layout/shell';
import { DashboardPage } from './pages/dashboard';
import { LoginPage } from './pages/login';
import { ModulePage } from './pages/module-page';
import { ForbiddenPage, NotFoundPage } from './pages/status-pages';

function Home() {
  const { role } = useAuth();
  if (!role) return null;
  const home = homePath(role);
  if (home !== '/') return <Navigate to={home} replace />;
  return <DashboardPage />;
}

const PLACEHOLDERS: ModuleId[] = MODULES.filter((m) => m.id !== 'dashboard').map((m) => m.id);

export function App() {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/connexion" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<Shell />}>
                <Route index element={<Home />} />
                {PLACEHOLDERS.map((id) => {
                  const m = MODULES.find((x) => x.id === id);
                  if (!m) return null;
                  return (
                    <Route
                      key={id}
                      path={`${m.path}/*`}
                      element={
                        <RequireModule id={id}>
                          <ModulePage titleKey={m.labelKey} />
                        </RequireModule>
                      }
                    />
                  );
                })}
                <Route path="/403" element={<ForbiddenPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
