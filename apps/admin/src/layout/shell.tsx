import { NavLink, Outlet } from 'react-router-dom';
import { fr } from '../i18n/fr';
import { useAuth } from '../auth/auth-context';
import { modulesFor } from '../auth/modules';
import { Button } from '../components/button';
import { Breadcrumbs } from './breadcrumbs';

const initials = (email: string): string => (email.slice(0, 2) || '?').toUpperCase();

export function Shell() {
  const { session, role, signOut } = useAuth();
  if (!session || !role) return null;
  const isCourier = role === 'courier';

  return (
    <div className="min-h-screen bg-surfaceAdmin text-ink">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-admin focus:bg-surface focus:p-2"
      >
        {fr['app.skipToContent']}
      </a>
      <header className="sticky top-0 z-40 flex min-h-14 items-center justify-between gap-4 border-b border-border bg-surface px-4 md:px-6">
        <span className="text-base font-semibold">{fr['app.brand']}</span>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-segmented px-2.5 py-1 text-xs font-medium">
            {fr[`role.${role}`]}
          </span>
          <span
            aria-label={`${fr['header.account']} ${session.email}`}
            role="img"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-medium text-surface"
          >
            {initials(session.email)}
          </span>
          <Button variant="secondary" onClick={signOut} className="min-h-9">
            {fr['header.logout']}
          </Button>
        </div>
      </header>
      <div className={isCourier ? '' : 'md:flex'}>
        {!isCourier && (
          <nav
            aria-label={fr['nav.label']}
            className="border-b border-border bg-surface md:min-h-[calc(100vh-3.5rem)] md:w-56 md:shrink-0 md:border-b-0 md:border-r"
          >
            <ul className="flex gap-1 overflow-x-auto p-2 md:flex-col md:overflow-visible">
              {modulesFor(role).map((m) => (
                <li key={m.id}>
                  <NavLink
                    to={m.path}
                    end={m.path === '/'}
                    className={({ isActive }) =>
                      `block whitespace-nowrap rounded-admin px-3 py-2 text-sm ${
                        isActive
                          ? 'bg-ink font-medium text-surface'
                          : 'text-ink hover:bg-surfaceMuted'
                      }`
                    }
                  >
                    {fr[m.labelKey]}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <main id="contenu" tabIndex={-1} className="min-w-0 flex-1 p-4 md:p-8">
          {!isCourier && <Breadcrumbs />}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
