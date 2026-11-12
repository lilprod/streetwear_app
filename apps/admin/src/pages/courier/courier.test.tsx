import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { fr } from '../../i18n/fr';
import { DEMO_HANDOVER_CODE } from '../../mocks/logistics-handlers';
import { server } from '../../mocks/server';
import { loginAs, renderApp } from '../../test-utils';
import { mapsUrl } from './courier-page';

const T = 15_000;
const starts = (t: string) => new RegExp(`^${t.replace(/[()]/g, '\\$&')}`);
const card = (n: string) => screen.findByRole('listitem', { name: `${fr['courier.run']} ${n}` });

describe('vue livreur', () => {
  const width = window.innerWidth;
  beforeEach(() => {
    window.innerWidth = 360;
  });
  afterEach(() => {
    window.innerWidth = width;
  });

  it(
    'redirige le livreur vers /livreur et ne montre aucun autre module',
    async () => {
      loginAs('courier');
      renderApp('/');
      expect(await screen.findByRole('heading', { name: fr['courier.title'] })).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: fr['nav.label'] })).not.toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      for (const k of ['nav.orders', 'nav.stock', 'nav.deliveries'] as const) {
        expect(screen.queryByRole('link', { name: fr[k] })).not.toBeInTheDocument();
      }
    },
    T,
  );

  it.each(['/commandes', '/stock', '/livraisons', '/retrait'])(
    'affiche 403 pour le livreur sur %s',
    async (path) => {
      loginAs('courier');
      renderApp(path);
      expect(
        await screen.findByRole('heading', { name: fr['forbidden.title'] }),
      ).toBeInTheDocument();
    },
    T,
  );

  it(
    'affiche 403 sur /livreur pour la logistique',
    async () => {
      loginAs('logistics');
      renderApp('/livreur');
      expect(
        await screen.findByRole('heading', { name: fr['forbidden.title'] }),
      ).toBeInTheDocument();
    },
    T,
  );

  it(
    'liste les courses avec itinéraire Google Maps, appel et solde en FCFA',
    async () => {
      loginAs('courier');
      renderApp('/livreur');
      const c = await card('TG-000004');
      const route = within(c).getByRole('link', { name: `${fr['courier.route']} TG-000004` });
      expect(route).toHaveAttribute('href', mapsUrl(6.14, 1.21));
      expect(route.getAttribute('href')).toMatch(
        /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=6\.14,1\.21$/,
      );
      expect(route).toHaveAttribute('target', '_blank');
      expect(route).toHaveAttribute('rel', expect.stringContaining('noopener'));
      expect(within(c).getByRole('link', { name: /\+228 90 12 34 00/ })).toHaveAttribute(
        'href',
        'tel:+22890123400',
      );
      expect(within(c).getByText((t) => t.replace(/\s/g, '') === '15000FCFA')).toBeInTheDocument();
      expect(within(c).getByRole('button', { name: fr['courier.start'] })).toBeInTheDocument();
    },
    T,
  );

  it(
    'démarre une course affectée',
    async () => {
      loginAs('courier');
      renderApp('/livreur');
      const user = userEvent.setup();
      const c = await card('TG-000004');
      await user.click(within(c).getByRole('button', { name: fr['courier.start'] }));
      await waitFor(async () =>
        expect(
          within(await card('TG-000004')).getByRole('button', { name: fr['courier.complete'] }),
        ).toBeInTheDocument(),
      );
    },
    T,
  );

  it('refuse un code faux avec le nombre d’essais restants, puis accepte le bon', async () => {
    loginAs('courier');
    renderApp('/livreur');
    const user = userEvent.setup();
    const c = await card('TG-000007');
    await user.type(within(c).getByLabelText(starts(fr['courier.code'])), '000000');
    await user.click(within(c).getByRole('button', { name: fr['courier.complete'] }));
    expect(await within(c).findByRole('alert')).toHaveTextContent(
      fr['courier.code.invalidMany'].replace('{n}', '4'),
    );
    const input = within(c).getByLabelText(starts(fr['courier.code']));
    expect(input).toHaveValue('');
    await user.type(input, DEMO_HANDOVER_CODE);
    await user.click(within(c).getByRole('button', { name: fr['courier.complete'] }));
    expect(await screen.findByText(fr['courier.completed'])).toBeInTheDocument();
  }, 30_000);

  it('vide le code et le montant après envoi, même en cas d’échec', async () => {
    loginAs('courier');
    server.use(
      http.post('*/v1/courier/deliveries/:id/complete', () =>
        HttpResponse.json(
          {
            error: {
              code: 'COD_AMOUNT_MISMATCH',
              message: 'Le montant encaissé doit être égal au solde à payer à la livraison.',
            },
          },
          { status: 400 },
        ),
      ),
    );
    renderApp('/livreur');
    const user = userEvent.setup();
    await user.click(
      within(await card('TG-000004')).getByRole('button', { name: fr['courier.start'] }),
    );
    const c = await card('TG-000004');
    const code = await within(c).findByLabelText(starts(fr['courier.code']));
    const amount = within(c).getByLabelText(starts(fr['courier.amount']));
    await user.type(code, DEMO_HANDOVER_CODE);
    await user.type(amount, '14000');
    await user.click(within(c).getByRole('button', { name: fr['courier.complete'] }));
    expect(await within(c).findByRole('alert')).toHaveTextContent(/montant encaissé/);
    expect(code).toHaveValue('');
    expect(amount).toHaveValue('');
    expect(document.body.innerHTML).not.toContain(DEMO_HANDOVER_CODE);
  }, 30_000);

  it(
    'exige un code à 6 chiffres et un montant avant d’appeler l’API',
    async () => {
      loginAs('courier');
      let called = 0;
      server.use(
        http.post('*/v1/courier/deliveries/:id/complete', () => {
          called += 1;
          return HttpResponse.json({});
        }),
      );
      renderApp('/livreur');
      const user = userEvent.setup();
      const c = await card('TG-000007');
      await user.type(within(c).getByLabelText(starts(fr['courier.code'])), '12');
      await user.click(within(c).getByRole('button', { name: fr['courier.complete'] }));
      expect(await within(c).findByRole('alert')).toHaveTextContent(fr['courier.code.format']);
      expect(called).toBe(0);
    },
    T,
  );

  it(
    'affiche le blocage HANDOVER_CODE_LOCKED',
    async () => {
      loginAs('courier');
      server.use(
        http.post('*/v1/courier/deliveries/:id/complete', () =>
          HttpResponse.json(
            {
              error: {
                code: 'HANDOVER_CODE_LOCKED',
                message:
                  'Trop de codes erronés : contactez la logistique pour débloquer cette livraison.',
              },
            },
            { status: 403 },
          ),
        ),
      );
      renderApp('/livreur');
      const user = userEvent.setup();
      const c = await card('TG-000007');
      await user.type(within(c).getByLabelText(starts(fr['courier.code'])), '123456');
      await user.click(within(c).getByRole('button', { name: fr['courier.complete'] }));
      expect(await within(c).findByRole('alert')).toHaveTextContent(/contactez la logistique/);
    },
    T,
  );

  it(
    'enregistre un échec avec motif, la note étant obligatoire pour « autre »',
    async () => {
      loginAs('courier');
      let body: Record<string, unknown> = {};
      server.use(
        http.post('*/v1/courier/deliveries/:id/fail', async ({ request }) => {
          body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({});
        }),
      );
      renderApp('/livreur');
      const user = userEvent.setup();
      const c = await card('TG-000007');
      await user.click(within(c).getByRole('button', { name: fr['courier.fail'] }));
      await user.selectOptions(within(c).getByLabelText(fr['courier.fail.reason']), 'other');
      await user.click(within(c).getByRole('button', { name: fr['courier.fail.confirm'] }));
      expect(await within(c).findByRole('alert')).toHaveTextContent(
        fr['courier.fail.noteRequired'],
      );
      await user.type(within(c).getByLabelText(fr['courier.fail.note']), 'Portail fermé');
      await user.click(within(c).getByRole('button', { name: fr['courier.fail.confirm'] }));
      await waitFor(() => expect(body).toEqual({ reason: 'other', note: 'Portail fermé' }));
      expect(await screen.findByText(fr['courier.failed'])).toBeInTheDocument();
    },
    T,
  );

  it(
    'affiche l’absence de profil livreur (403)',
    async () => {
      loginAs('courier');
      server.use(
        http.get('*/v1/courier/deliveries', () =>
          HttpResponse.json(
            {
              error: {
                code: 'FORBIDDEN',
                message: 'Aucun profil livreur actif n’est associé à ce compte.',
              },
            },
            { status: 403 },
          ),
        ),
      );
      renderApp('/livreur');
      expect(await screen.findByRole('alert')).toHaveTextContent(/profil livreur/);
    },
    T,
  );
});
