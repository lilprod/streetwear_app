import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fr } from '../../i18n/fr';
import { loginAs, renderApp } from '../../test-utils';

const SLOW = 15_000;

describe('réglages et modèles de notifications', () => {
  it('403 pour le gestionnaire de commandes sur /reglages', async () => {
    loginAs('order_manager');
    renderApp('/reglages');
    expect(await screen.findByRole('heading', { name: fr['forbidden.title'] })).toBeInTheDocument();
  });

  it(
    'valide l’acompte, le délai et exige au moins un moyen de paiement',
    async () => {
      loginAs('super_admin');
      renderApp('/reglages');
      const form = await screen.findByRole('form', { name: fr['settings.shop.title'] });
      const deposit = within(form).getByLabelText(fr['settings.deposit']);
      await waitFor(() => expect(deposit).toHaveValue(50));
      await userEvent.clear(deposit);
      await userEvent.type(deposit, '150');
      await userEvent.click(within(form).getByRole('button', { name: fr['settings.save'] }));
      expect(await within(form).findByText(fr['settings.deposit.format'])).toBeInTheDocument();

      await userEvent.clear(deposit);
      await userEvent.type(deposit, '30');
      const expiry = within(form).getByLabelText(fr['settings.expiry']);
      await userEvent.clear(expiry);
      await userEvent.type(expiry, '2');
      await userEvent.click(within(form).getByRole('button', { name: fr['settings.save'] }));
      expect(await within(form).findByText(fr['settings.expiry.format'])).toBeInTheDocument();

      await userEvent.clear(expiry);
      await userEvent.type(expiry, '45');
      for (const m of ['T-Money', 'Flooz', 'Carte', 'À la livraison']) {
        await userEvent.click(within(form).getByRole('checkbox', { name: m }));
      }
      await userEvent.click(within(form).getByRole('button', { name: fr['settings.save'] }));
      expect(await within(form).findByText(fr['settings.methods.required'])).toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'enregistre les réglages',
    async () => {
      loginAs('super_admin');
      renderApp('/reglages');
      const form = await screen.findByRole('form', { name: fr['settings.shop.title'] });
      const deposit = within(form).getByLabelText(fr['settings.deposit']);
      await waitFor(() => expect(deposit).toHaveValue(50));
      await userEvent.clear(deposit);
      await userEvent.type(deposit, '30');
      await userEvent.click(within(form).getByRole('button', { name: fr['settings.save'] }));
      expect(await screen.findByText(fr['settings.saved'])).toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'aperçu d’un modèle après enregistrement',
    async () => {
      loginAs('super_admin');
      renderApp('/reglages');
      const table = await screen.findByRole('region', { name: fr['templates.caption'] });
      const edit = await within(table).findByRole('button', {
        name: `${fr['templates.action.edit']} order.ready_for_pickup ${fr['templates.channel.sms']}`,
      });
      await userEvent.click(edit);
      const form = screen.getByRole('form', { name: /Modifier le modèle/ });
      expect(within(form).getByLabelText(fr['templates.field.title'])).toBeDisabled();
      await userEvent.click(within(form).getByRole('button', { name: fr['catalog.form.save'] }));
      const preview = await screen.findByText(/Code de retrait : 123456/);
      expect(preview).toHaveTextContent('Streetwear : commande SW-2026-0101 disponible');
    },
    SLOW,
  );

  it(
    'refuse un modèle avec variable inconnue et affiche la raison',
    async () => {
      loginAs('super_admin');
      renderApp('/reglages');
      const table = await screen.findByRole('region', { name: fr['templates.caption'] });
      await userEvent.click(
        await within(table).findByRole('button', {
          name: `${fr['templates.action.edit']} stock.below_threshold ${fr['templates.channel.email']}`,
        }),
      );
      const form = screen.getByRole('form', { name: /Modifier le modèle/ });
      const body = within(form).getByLabelText(fr['templates.field.body']);
      await userEvent.clear(body);
      fireEvent.change(body, { target: { value: 'Stock {{inconnu}} bas' } });
      await userEvent.click(within(form).getByRole('button', { name: fr['catalog.form.save'] }));
      expect(
        await within(form).findByText(fr['templates.reason.UNKNOWN_VARIABLE']),
      ).toBeInTheDocument();
    },
    SLOW,
  );
});
