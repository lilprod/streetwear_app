import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { uid } from '@streetwear/shared';
import { fr } from '../../i18n/fr';
import { server } from '../../mocks/server';
import { loginAs, renderApp } from '../../test-utils';

afterEach(() => vi.restoreAllMocks());

describe('file de production', () => {
  it('sépare les commandes à affecter et en production', async () => {
    loginAs('production');
    renderApp('/production');
    const toAssign = await screen.findByRole('table', { name: fr['production.caption.toAssign'] });
    expect(within(toAssign).getByText('TG-000003')).toBeInTheDocument();
    expect(within(toAssign).getByText('TG-000004')).toBeInTheDocument();
    const inProgress = screen.getByRole('table', { name: fr['production.caption.inProgress'] });
    expect(within(inProgress).getByText('TG-000005')).toBeInTheDocument();
    expect(within(inProgress).queryByText('TG-000003')).not.toBeInTheDocument();
  });

  it('affecte l’opérateur : la commande passe en production', async () => {
    loginAs('production');
    renderApp('/production');
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: `${fr['production.assign']} TG-000003` }),
    );
    expect(await screen.findByText(fr['production.assigned'])).toBeInTheDocument();
    const inProgress = screen.getByRole('table', { name: fr['production.caption.inProgress'] });
    await waitFor(() => expect(within(inProgress).getByText('TG-000003')).toBeInTheDocument());
    expect(
      screen.queryByRole('button', { name: `${fr['production.assign']} TG-000003` }),
    ).not.toBeInTheDocument();
  });

  it('affiche OPERATOR_INVALID (422) en français', async () => {
    loginAs('super_admin');
    server.use(
      http.post('*/v1/admin/orders/:id/assign-operator', () =>
        HttpResponse.json(
          {
            error: { code: 'OPERATOR_INVALID', message: 'Cet opérateur ne peut pas être affecté.' },
          },
          { status: 422 },
        ),
      ),
    );
    renderApp('/production');
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: `${fr['production.assign']} TG-000003` }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cet opérateur ne peut pas être affecté.',
    );
  });

  it('obtient des liens HD à chaque demande, sans cache', async () => {
    loginAs('production');
    renderApp('/production');
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: `${fr['production.files']} TG-000005` }),
    );
    const panel = await screen.findByRole('region', {
      name: `${fr['production.filesFor']} TG-000005`,
    });
    expect(within(panel).queryByRole('link')).not.toBeInTheDocument();
    const get = await within(panel).findByRole('button', { name: /Obtenir les liens/ });
    await user.click(get);
    const first = await within(panel).findByRole('link', { name: /Télécharger le recto/ });
    expect(first).toHaveAttribute('target', '_blank');
    expect(first).toHaveAttribute('rel', expect.stringContaining('noopener'));
    const firstUrl = first.getAttribute('href');
    expect(firstUrl).toContain('ttl=900');
    expect(within(panel).getByText(fr['production.linksValid'])).toBeInTheDocument();
    await user.click(get);
    await waitFor(() =>
      expect(within(panel).getByRole('link', { name: /Télécharger le recto/ })).not.toHaveAttribute(
        'href',
        firstUrl,
      ),
    );
    await user.click(within(panel).getByRole('button', { name: fr['production.close'] }));
    expect(
      screen.queryByRole('region', { name: /Fichiers HD de la commande/ }),
    ).not.toBeInTheDocument();
  });

  it('indique quand les fichiers HD ne sont pas encore prêts', async () => {
    loginAs('production');
    server.use(http.get('*/v1/admin/order-items/:id/print-files', () => HttpResponse.json({})));
    renderApp('/production');
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: `${fr['production.files']} TG-000005` }),
    );
    await user.click(await screen.findByRole('button', { name: /Obtenir les liens/ }));
    expect(await screen.findByText(fr['production.noFiles'])).toBeInTheDocument();
  });

  it('régénère les fichiers (202 queued)', async () => {
    loginAs('production');
    renderApp(`/commandes/${uid(505)}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^Régénérer/ }));
    expect(await screen.findByText(fr['production.regenerating'])).toBeInTheDocument();
  });

  it('affiche ORDER_NOT_PRODUCIBLE (409) pour une commande non produisible', async () => {
    loginAs('production');
    renderApp(`/commandes/${uid(508)}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^Régénérer/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/régénérés que pour une commande/);
  });

  it('ouvre la fiche PDF avec le jeton d’authentification', async () => {
    loginAs('production');
    let auth: string | null = null;
    server.use(
      http.get('*/v1/admin/orders/:id/production-sheet.pdf', ({ request }) => {
        auth = request.headers.get('Authorization');
        return new HttpResponse('%PDF-1.4', { headers: { 'Content-Type': 'application/pdf' } });
      }),
    );
    const tab = { location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    URL.createObjectURL = vi.fn(() => 'blob:fiche');
    URL.revokeObjectURL = vi.fn();
    renderApp('/production');
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: `${fr['production.sheet']} TG-000005` }),
    );
    expect(await screen.findByText(fr['production.sheetOpened'])).toBeInTheDocument();
    expect(auth).toMatch(/^Bearer /);
    expect(tab.location.href).toBe('blob:fiche');
  });

  it('ferme l’onglet et signale l’erreur si la fiche échoue', async () => {
    loginAs('production');
    server.use(
      http.get('*/v1/admin/orders/:id/production-sheet.pdf', () =>
        HttpResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Élément introuvable.' } },
          { status: 404 },
        ),
      ),
    );
    const tab = { location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    renderApp('/production');
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: `${fr['production.sheet']} TG-000005` }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Élément introuvable.');
    expect(tab.close).toHaveBeenCalled();
  });

  it('une URL de production est interdite à la logistique (403)', async () => {
    loginAs('logistics');
    renderApp('/production');
    expect(await screen.findByRole('heading', { name: fr['forbidden.title'] })).toBeInTheDocument();
  });

  it('la commande en détail masque les fichiers HD pour l’équipe commandes', async () => {
    loginAs('order_manager');
    renderApp(`/commandes/${uid(505)}`);
    await screen.findByRole('heading', { name: /TG-000005/ });
    expect(screen.queryByRole('button', { name: /^Régénérer/ })).not.toBeInTheDocument();
  });
});
