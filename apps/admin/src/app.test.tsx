import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN_ROLES } from '@streetwear/shared';
import { modulesFor } from './auth/modules';
import { fr } from './i18n/fr';
import { DEMO_PASSWORD, DEMO_TOTP_CODE } from './mocks/handlers';
import { loadSession, SESSION_DURATION_MS } from './auth/session';
import { loginAs, renderApp } from './test-utils';

async function fillLogin(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(fr['login.email']), email);
  await user.type(screen.getByLabelText(fr['login.password']), DEMO_PASSWORD);
  await user.click(screen.getByRole('button', { name: fr['login.submit'] }));
  return user;
}

describe('connexion', () => {
  it('redirige vers /connexion sans session', async () => {
    renderApp('/commandes');
    expect(await screen.findByRole('heading', { name: fr['login.title'] })).toBeInTheDocument();
  });

  it('e-mail + mot de passe puis TOTP, session de 8 h', async () => {
    renderApp('/');
    const user = await fillLogin('admin@streetwear.test');
    await user.type(await screen.findByLabelText(fr['login.totp.code']), DEMO_TOTP_CODE);
    await user.click(screen.getByRole('button', { name: fr['login.totp.submit'] }));
    expect(await screen.findByRole('heading', { name: fr['dashboard.title'] })).toBeInTheDocument();
    const s = loadSession();
    expect(s?.role).toBe('super_admin');
    expect((s?.expiresAt ?? 0) - Date.now()).toBeGreaterThan(SESSION_DURATION_MS - 5000);
    expect((await screen.findAllByText(/FCFA/)).length).toBeGreaterThan(0);
  });

  it('affiche un message français pour un mauvais mot de passe', async () => {
    renderApp('/');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(fr['login.email']), 'admin@streetwear.test');
    await user.type(screen.getByLabelText(fr['login.password']), 'mauvais');
    await user.click(screen.getByRole('button', { name: fr['login.submit'] }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou mot de passe incorrect.');
  });

  it('valide le format du code TOTP', async () => {
    renderApp('/');
    const user = await fillLogin('admin@streetwear.test');
    await user.type(await screen.findByLabelText(fr['login.totp.code']), '12');
    await user.click(screen.getByRole('button', { name: fr['login.totp.submit'] }));
    expect(await screen.findByText(fr['login.error.codeFormat'])).toBeInTheDocument();
  });

  it('propose l’enrôlement TOTP au premier login', async () => {
    renderApp('/');
    await fillLogin('nouveau@streetwear.test');
    expect(
      await screen.findByRole('heading', { name: fr['login.enroll.title'] }),
    ).toBeInTheDocument();
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
  });

  it('le livreur se connecte sans TOTP et arrive sur /livreur', async () => {
    renderApp('/');
    await fillLogin('livreur@streetwear.test');
    expect(await screen.findByRole('heading', { name: fr['nav.courier'] })).toBeInTheDocument();
  });

  it('la déconnexion efface la session', async () => {
    loginAs('super_admin');
    renderApp('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: fr['header.logout'] }));
    expect(await screen.findByRole('heading', { name: fr['login.title'] })).toBeInTheDocument();
    expect(loadSession()).toBeNull();
  });
});

describe('navigation par rôle', () => {
  it.each(ADMIN_ROLES.filter((r) => r !== 'courier'))(
    '%s ne voit que ses modules',
    async (role) => {
      loginAs(role);
      renderApp('/commandes');
      const nav = await screen.findByRole('navigation', { name: fr['nav.label'] });
      const labels = within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent);
      expect(labels).toEqual(modulesFor(role).map((m) => fr[m.labelKey]));
    },
  );

  it('affiche 403 pour une URL interdite', async () => {
    loginAs('production');
    renderApp('/catalogue');
    expect(await screen.findByRole('heading', { name: fr['forbidden.title'] })).toBeInTheDocument();
  });

  it('le livreur ne peut pas ouvrir /commandes', async () => {
    loginAs('courier');
    renderApp('/commandes');
    expect(await screen.findByRole('heading', { name: fr['forbidden.title'] })).toBeInTheDocument();
  });

  it('affiche 404 et le fil d’Ariane', async () => {
    loginAs('super_admin');
    renderApp('/inexistant');
    expect(await screen.findByRole('heading', { name: fr['notFound.title'] })).toBeInTheDocument();
  });

  it('fil d’Ariane sur une sous-page', async () => {
    loginAs('super_admin');
    renderApp('/commandes/TG-000001');
    const crumbs = await screen.findByRole('navigation', { name: fr['breadcrumb.label'] });
    expect(within(crumbs).getByText('TG-000001')).toHaveAttribute('aria-current', 'page');
  });
});
