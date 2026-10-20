import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './app';
import { DEMO_ACCOUNTS, demoSession } from './mocks/handlers';
import { saveSession, sessionFromApi } from './auth/session';
import type { AdminRole } from '@streetwear/shared';

export function loginAs(role: AdminRole): void {
  const account = DEMO_ACCOUNTS.find((a) => a.role === role);
  if (!account) throw new Error(`Pas de compte de démo pour ${role}`);
  saveSession(sessionFromApi(demoSession(account)));
}

export function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
