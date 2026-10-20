import { Link, useLocation } from 'react-router-dom';
import { fr } from '../i18n/fr';
import { MODULES } from '../auth/modules';

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);
  const first = MODULES.find((m) => m.path === `/${segments[0] ?? ''}`);
  const crumbs: { label: string; to?: string }[] = [{ label: fr['breadcrumb.home'], to: '/' }];
  if (first && first.path !== '/') {
    crumbs.push({ label: fr[first.labelKey], to: segments.length > 1 ? first.path : undefined });
    if (segments.length > 1)
      crumbs.push({ label: decodeURIComponent(segments.slice(1).join(' / ')) });
  }
  if (crumbs.length === 1) crumbs[0] = { label: fr['breadcrumb.home'] };

  return (
    <nav aria-label={fr['breadcrumb.label']} className="mb-4 text-sm text-inkSecondary">
      <ol className="flex flex-wrap items-center gap-2">
        {crumbs.map((c, i) => (
          <li key={i} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true">/</span>}
            {c.to ? (
              <Link to={c.to} className="rounded-admin underline-offset-2 hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-ink">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
