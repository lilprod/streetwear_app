import { Link } from 'react-router-dom';
import { fr } from '../i18n/fr';

function StatusPage({ code, title, body }: { code: string; title: string; body: string }) {
  return (
    <section className="mx-auto max-w-md py-16 text-center">
      <p className="font-mono text-sm text-inkSecondary">{code}</p>
      <h1 className="mt-2 text-[32px] font-semibold leading-10">{title}</h1>
      <p className="mt-2 text-sm text-inkSecondary">{body}</p>
      <Link
        to="/"
        className="mt-6 inline-flex min-h-10 items-center rounded-admin bg-ink px-4 text-sm font-medium text-surface"
      >
        {fr['common.backHome']}
      </Link>
    </section>
  );
}

export const ForbiddenPage = () => (
  <StatusPage code="403" title={fr['forbidden.title']} body={fr['forbidden.body']} />
);
export const NotFoundPage = () => (
  <StatusPage code="404" title={fr['notFound.title']} body={fr['notFound.body']} />
);
