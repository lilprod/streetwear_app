import { Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider, useAuth } from './auth/auth-context';
import { RequireAuth, RequireModule } from './auth/guards';
import { homePath, MODULES, type ModuleId } from './auth/modules';
import { ToastProvider } from './components/toast';
import { Shell } from './layout/shell';
import { CatalogPage } from './pages/catalog/catalog-page';
import { DashboardPage } from './pages/dashboard/dashboard-page';
import { LoginPage } from './pages/login';
import { OrderDetailPage } from './pages/orders/order-detail';
import { OrdersListPage } from './pages/orders/orders-list';
import { PaymentsPage } from './pages/payments/payments-page';
import { ProductionPage } from './pages/production/production-page';
import { CourierPage } from './pages/courier/courier-page';
import { DeliveriesPage } from './pages/deliveries/deliveries-page';
import { ZonesPage } from './pages/deliveries/zones-page';
import { PickupPage } from './pages/pickup/pickup-page';
import { StockPage } from './pages/stock/stock-page';
import { SettingsPage } from './pages/settings/settings-page';
import { TeamPage } from './pages/team/team-page';
import { ModulePage } from './pages/module-page';
import { ForbiddenPage, NotFoundPage } from './pages/status-pages';

function Home() {
  const { role } = useAuth();
  if (!role) return null;
  const home = homePath(role);
  if (home !== '/') return <Navigate to={home} replace />;
  return <DashboardPage />;
}

const IMPLEMENTED: ModuleId[] = [
  'dashboard',
  'orders',
  'production',
  'deliveries',
  'courier',
  'pickup',
  'stock',
  'catalog',
  'payments',
  'team',
  'settings',
];
const PLACEHOLDERS: ModuleId[] = MODULES.filter((m) => !IMPLEMENTED.includes(m.id)).map(
  (m) => m.id,
);

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
                <Route
                  path="/commandes"
                  element={
                    <RequireModule id="orders">
                      <OrdersListPage />
                    </RequireModule>
                  }
                />
                <Route
                  path="/commandes/:id"
                  element={
                    <RequireModule id="orders">
                      <OrderDetailPage />
                    </RequireModule>
                  }
                />
                <Route
                  path="/production"
                  element={
                    <RequireModule id="production">
                      <ProductionPage />
                    </RequireModule>
                  }
                />
                <Route
                  path="/livraisons"
                  element={
                    <RequireModule id="deliveries">
                      <DeliveriesPage />
                    </RequireModule>
                  }
                />
                <Route
                  path="/livraisons/zones"
                  element={
                    <RequireModule id="deliveries">
                      <ZonesPage />
                    </RequireModule>
                  }
                />
                <Route
                  path="/livreur"
                  element={
                    <RequireModule id="courier">
                      <CourierPage />
                    </RequireModule>
                  }
                />
                <Route
                  path="/retrait"
                  element={
                    <RequireModule id="pickup">
                      <PickupPage />
                    </RequireModule>
                  }
                />
                <Route
                  path="/stock"
                  element={
                    <RequireModule id="stock">
                      <StockPage />
                    </RequireModule>
                  }
                />
                <Route
                  path="/catalogue"
                  element={
                    <RequireModule id="catalog">
                      <CatalogPage />
                    </RequireModule>
                  }
                />
                <Route
                  path="/paiements"
                  element={
                    <RequireModule id="payments">
                      <PaymentsPage />
                    </RequireModule>
                  }
                />
                <Route
                  path="/equipe"
                  element={
                    <RequireModule id="team">
                      <TeamPage />
                    </RequireModule>
                  }
                />
                <Route
                  path="/reglages"
                  element={
                    <RequireModule id="settings">
                      <SettingsPage />
                    </RequireModule>
                  }
                />
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
