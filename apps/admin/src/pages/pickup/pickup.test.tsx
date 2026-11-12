import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { fr } from '../../i18n/fr';
import { server } from '../../mocks/server';
import { loginAs, renderApp } from '../../test-utils';

const T = 15_000;
const hoursLabel = (k: 'stores.hours.days' | 'stores.hours.range') => new RegExp(`^${fr[k]}`);

describe('retrait', () => {
  it(
    'affiche 403 à la production et au livreur',
    async () => {
      loginAs('production');
      renderApp('/retrait');
      expect(
        await screen.findByRole('heading', { name: fr['forbidden.title'] }),
      ).toBeInTheDocument();
    },
    T,
  );

  it(
    'liste les boutiques avec horaires et capacité',
    async () => {
      loginAs('logistics');
      renderApp('/retrait');
      const table = await screen.findByRole('table', { name: fr['stores.caption'] });
      expect(await within(table).findByText('Boutique Streetwear Tokoin')).toBeInTheDocument();
      expect(within(table).getByText('lun-sam : 09:00-19:00')).toBeInTheDocument();
      expect(within(table).getByText('dim : fermé')).toBeInTheDocument();
    },
    T,
  );

  it('valide les horaires puis enregistre la boutique', async () => {
    loginAs('logistics');
    let body: Record<string, unknown> = {};
    server.use(
      http.patch('*/v1/admin/stores/:id', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({});
      }),
    );
    renderApp('/retrait');
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: `${fr['stores.edit']} Boutique Streetwear Tokoin`,
      }),
    );
    const form = await screen.findByRole('form', { name: fr['stores.form.edit'] });
    const range = within(form).getAllByLabelText(
      hoursLabel('stores.hours.range'),
    )[0] as HTMLElement;
    await user.clear(range);
    await user.type(range, '9h-19h');
    await user.click(within(form).getByRole('button', { name: fr['stores.save'] }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(fr['stores.error.hours']);
    await user.clear(range);
    await user.type(range, '08:00-18:00');
    await user.click(within(form).getByRole('button', { name: fr['stores.save'] }));
    await waitFor(() =>
      expect(body.openingHours).toEqual({ 'lun-sam': '08:00-18:00', dim: 'fermé' }),
    );
    expect(await screen.findByText(fr['stores.updated'])).toBeInTheDocument();
  }, 30_000);

  it('crée une boutique', async () => {
    loginAs('super_admin');
    renderApp('/retrait');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: fr['stores.add'] }));
    const form = await screen.findByRole('form', { name: fr['stores.form.create'] });
    await user.click(within(form).getByRole('button', { name: fr['stores.save'] }));
    expect(await within(form).findByText(fr['stores.error.name'])).toBeInTheDocument();
    await user.type(
      within(form).getByLabelText(new RegExp(`^${fr['stores.name']}`)),
      'Kiosque Agoè',
    );
    await user.type(
      within(form).getByLabelText(new RegExp(`^${fr['stores.address']}`)),
      'Agoè Nyivé',
    );
    await user.type(within(form).getByLabelText(new RegExp(`^${fr['stores.lat']}`)), '6.2');
    await user.type(within(form).getByLabelText(new RegExp(`^${fr['stores.lng']}`)), '1.19');
    await user.click(within(form).getByRole('button', { name: fr['stores.save'] }));
    expect(await screen.findByText(fr['stores.created'])).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: fr['stores.caption'] });
    expect(await within(table).findByText('Kiosque Agoè')).toBeInTheDocument();
  }, 30_000);

  it('affiche les créneaux, modifie une capacité et refuse sous les réservations', async () => {
    loginAs('logistics');
    renderApp('/retrait');
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', {
        name: `${fr['stores.slots']} Boutique Streetwear Tokoin`,
      }),
    );
    const panel = await screen.findByRole('region', {
      name: `${fr['slots.title']} — Boutique Streetwear Tokoin`,
    });
    const first = await within(panel).findAllByLabelText(new RegExp(`^${fr['slots.capacity']}`));
    expect(first.length).toBe(3);
    const cap = first[0] as HTMLElement;
    await user.clear(cap);
    await user.type(cap, '1');
    await user.click(
      within(panel).getAllByRole('button', { name: /^Enregistrer/ })[0] as HTMLElement,
    );
    expect(await screen.findByText(/inférieure aux places déjà réservées/)).toBeInTheDocument();
    const cap2 = (
      await within(panel).findAllByLabelText(new RegExp(`^${fr['slots.capacity']}`))
    )[1] as HTMLElement;
    await user.clear(cap2);
    await user.type(cap2, '8');
    await user.click(
      within(panel).getAllByRole('button', { name: /^Enregistrer/ })[1] as HTMLElement,
    );
    expect(await screen.findByText(fr['slots.updated'])).toBeInTheDocument();
  }, 30_000);

  it(
    'génère des créneaux',
    async () => {
      loginAs('logistics');
      renderApp('/retrait');
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole('button', {
          name: `${fr['stores.slots']} Boutique Streetwear Tokoin`,
        }),
      );
      const panel = await screen.findByRole('region', {
        name: `${fr['slots.title']} — Boutique Streetwear Tokoin`,
      });
      await user.click(within(panel).getByRole('button', { name: fr['slots.generate'] }));
      expect(await screen.findByText('14 créneau(x) créé(s).')).toBeInTheDocument();
    },
    T,
  );
});
