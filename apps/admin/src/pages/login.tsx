import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { fr } from '../i18n/fr';
import { errorMessage } from '../lib/errors';
import { useAuth } from '../auth/auth-context';
import { adminLogin, adminTotp, isChallenge, type TotpEnrollment } from '../auth/auth-api';
import { homePath } from '../auth/modules';
import { Button } from '../components/button';

const emailSchema = z.string().trim().email();
const fieldClass =
  'min-h-11 w-full rounded-admin border border-borderStrong bg-surface px-3 text-sm';

type Step =
  { kind: 'credentials' } | { kind: 'totp'; challenge: string; enrollment?: TotpEnrollment };

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: (p: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby'?: string;
  }) => React.ReactNode;
}) {
  const id = useId();
  const errId = `${id}-err`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({ id, 'aria-invalid': !!error, 'aria-describedby': error ? errId : undefined })}
      {error && (
        <p id={errId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function LoginPage() {
  const { session, signIn, expired } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to={homePath(session.role)} replace />;

  const finish = (tokens: { accessToken: string; refreshToken?: string }) => {
    const s = signIn(tokens);
    if (!s) setFormError(fr['error.unknown']);
    else navigate(homePath(s.role), { replace: true });
  };

  const submitCredentials = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!emailSchema.safeParse(email).success) next.email = fr['login.error.invalidEmail'];
    if (!password) next.password = fr['login.error.passwordRequired'];
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const res = await adminLogin({ email: email.trim(), password });
      if (isChallenge(res)) {
        setStep({ kind: 'totp', challenge: res.challenge, enrollment: res.enrollment });
      } else finish(res);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    if (step.kind !== 'totp') return;
    setFormError(null);
    if (!/^\d{6}$/.test(code)) {
      setErrors({ code: fr['login.error.codeFormat'] });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      finish(await adminTotp({ challenge: step.challenge, code }));
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-surfaceAdmin p-4">
      <div className="w-full max-w-sm rounded-admin-lg border border-border bg-surface p-6">
        {step.kind === 'credentials' ? (
          <form onSubmit={submitCredentials} noValidate className="flex flex-col gap-4">
            <h1 className="text-2xl font-semibold">{fr['login.title']}</h1>
            <p className="text-sm text-inkSecondary">{fr['login.subtitle']}</p>
            {expired && !formError && (
              <p role="status" className="text-sm text-inkSecondary">
                {fr['login.sessionExpired']}
              </p>
            )}
            <Field label={fr['login.email']} error={errors.email}>
              {(p) => (
                <input
                  {...p}
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={fieldClass}
                />
              )}
            </Field>
            <Field label={fr['login.password']} error={errors.password}>
              {(p) => (
                <input
                  {...p}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={fieldClass}
                />
              )}
            </Field>
            {formError && (
              <p role="alert" className="text-sm text-danger">
                {formError}
              </p>
            )}
            <Button type="submit" disabled={busy} className="min-h-11">
              {fr['login.submit']}
            </Button>
          </form>
        ) : (
          <form onSubmit={submitCode} noValidate className="flex flex-col gap-4">
            <h1 className="text-2xl font-semibold">
              {step.enrollment ? fr['login.enroll.title'] : fr['login.totp.title']}
            </h1>
            <p className="text-sm text-inkSecondary">
              {step.enrollment ? fr['login.enroll.help'] : fr['login.totp.help']}
            </p>
            {step.enrollment && (
              <p className="text-sm">
                {fr['login.enroll.secret']} :{' '}
                <code className="break-all rounded-admin bg-surfaceMuted px-2 py-1 font-mono">
                  {step.enrollment.secret}
                </code>
              </p>
            )}
            <Field label={fr['login.totp.code']} error={errors.code}>
              {(p) => (
                <input
                  {...p}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className={`${fieldClass} font-mono tracking-widest`}
                />
              )}
            </Field>
            {formError && (
              <p role="alert" className="text-sm text-danger">
                {formError}
              </p>
            )}
            <Button type="submit" disabled={busy} className="min-h-11">
              {fr['login.totp.submit']}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setStep({ kind: 'credentials' });
                setCode('');
                setErrors({});
                setFormError(null);
              }}
            >
              {fr['login.totp.back']}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
