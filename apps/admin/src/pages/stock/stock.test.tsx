import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { fr } from '../../i18n/fr';
import { server } from '../../mocks/server';
import { loginAs, renderApp } from '../../test-utils';

const T = 15_000;

describe('stock', () => {
  it(
    'affiche 403 à la logistique et au livreur, accès à la production',
    async () => {
      loginAs('logistics');
      const { unmount } = renderApp('/stock');
      expect(
        await screen.findByRole('heading', { name: fr['forbidden.title'] }),
      ).toBeInTheDocument();
      unmount();
      localStorage.clear();
      loginAs('production');
      renderApp('/stock');
      expect(
        await screen.findByRole('heading', { name: fr['nav.stock'], level: 1 }),
      ).toBeInTheDocument();
      const nav = screen.getByRole('navigation', { name: fr['nav.label'] });
      expect(
        within(nav).queryByRole('link', { name: fr['nav.deliveries'] }),
      ).not.toBeInTheDocument();
    },
    T,
  );

  it(
    'affiche le tableau couleur × taille avec disponible, seuil et alertes',
    async () => {
      loginAs('production');
      renderApp('/stock');
      const table = await screen.findByRole('table', { name: fr['stock.caption'] });
      expect(within(table).getByRole('columnheader', { name: 'XL' })).toBeInTheDocument();
      const noirM = await within(table).findByRole('button', { name: /^Noir M : 2 disponible/ });
      expect(noirM).toHaveAttribute('data-low', 'true');
      expect(noirM).toHaveAccessibleName(/Sous le seuil/);
      expect(
        within(table).getByRole('button', { name: /^Noir S : 19 disponible/ }),
      ).not.toHaveAttribute('data-low');
      const alerts = screen.getByRole('region', { name: fr['stock.alerts'] });
      expect(within(alerts).getByText(/Noir M/)).toBeInTheDocument();
    },
    T,
  );

  it('enregistre une entrée de stock et met à jour le disponible', async () => {
    loginAs('production');
    renderApp('/stock');
    const user = userEvent.setup();
    const form = await screen.findByRole('form', { name: fr['stock.form.title'] });
    await user.click(within(form).getByRole('button', { name: fr['stock.submit'] }));
    expect(await within(form).findByText(fr['stock.error.quantityIn'])).toBeInTheDocument();
    expect(within(form).getByText(fr['stock.error.note'])).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /^Noir M : 2 disponible/ }));
    expect(within(form).getByLabelText(fr['stock.color'])).toHaveValue('col-noir');
    expect(within(form).getByLabelText(fr['stock.size'])).toHaveValue('M');
    await user.type(within(form).getByLabelText(new RegExp(`^${fr['stock.quantity']}`)), '10');
    await user.type(
      within(form).getByLabelText(new RegExp(`^${fr['stock.note']}`)),
      'Réassort fournisseur',
    );
    await user.click(within(form).getByRole('button', { name: fr['stock.submit'] }));
    expect(await screen.findByText('Stock mis à jour : Noir M.')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /^Noir M : 12 disponible/ }),
    ).not.toHaveAttribute('data-low');
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: fr['stock.alerts'] })).not.toBeInTheDocument(),
    );
  }, 30_000);

  it('modifie le seuil d’alerte', async () => {
    loginAs('super_admin');
    renderApp('/stock');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^Sable S : / }));
    const detail = await screen.findByRole('region', { name: fr['stock.detail'] });
    const input = within(detail).getByLabelText(fr['stock.threshold']);
    await user.clear(input);
    await user.type(input, '30');
    await user.click(within(detail).getByRole('button', { name: fr['stock.threshold.save'] }));
    expect(await screen.findByText(fr['stock.threshold.saved'])).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /^Sable S : .*seuil 30\..*Sous le seuil/ }),
    ).toHaveAttribute('data-low', 'true');
  }, 30_000);

  it(
    'affiche l’erreur de l’API (ajustement sous le réservé)',
    async () => {
      loginAs('production');
      server.use(
        http.post('*/v1/admin/stock/movements', () =>
          HttpResponse.json(
            {
              error: {
                code: 'VALIDATION_FAILED',
                message:
                  'Ajustement impossible : le stock deviendrait inférieur aux pièces réservées.',
              },
            },
            { status: 400 },
          ),
        ),
      );
      renderApp('/stock');
      const user = userEvent.setup();
      const form = await screen.findByRole('form', { name: fr['stock.form.title'] });
      await user.selectOptions(within(form).getByLabelText(fr['stock.type']), 'adjust');
      await user.type(within(form).getByLabelText(new RegExp(`^${fr['stock.quantity']}`)), '-50');
      await user.type(
        within(form).getByLabelText(new RegExp(`^${fr['stock.note']}`)),
        'Inventaire',
      );
      await user.click(within(form).getByRole('button', { name: fr['stock.submit'] }));
      expect(await within(form).findByRole('alert')).toHaveTextContent(/Ajustement impossible/);
    },
    T,
  );
});
