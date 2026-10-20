import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './app';
import { DEMO_ACCOUNTS, fakeJwt } from './mocks/handlers';
import { saveSession, sessionFromTokens } from './auth/session';
import type { AdminRole } from '@streetwear/shared';

export function loginAs(role: AdminRole): void {
  const account = DEMO_ACCOUNTS.find((a) => a.role === role);
  if (!account) throw new Error(`Pas de compte de démo pour ${role}`);
  const session = sessionFromTokens({ accessToken: fakeJwt(account) });
  if (!session) throw new Error('Session invalide');
  saveSession(session);
}

export function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
