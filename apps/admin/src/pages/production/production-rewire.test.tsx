import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { uid, type AdminOrder, type ProductionQueueItem } from '@streetwear/shared';
import { fr } from '../../i18n/fr';
import { demoUserId } from '../../mocks/handlers';
import { DEMO_OPERATORS, patchDemoOrder } from '../../mocks/orders-handlers';
import { server } from '../../mocks/server';
import { loginAs, renderApp } from '../../test-utils';

const SLOW = 15_000;
const ID = (n: number) => uid(500 + n);
const op = (id: string) => DEMO_OPERATORS.find((o) => o.id === id)?.name ?? '';

describe('file de production : API /admin/production/queue', () => {
  it(
    'lit la file par statut, sans appeler /admin/orders',
    async () => {
      loginAs('production');
      const urls: string[] = [];
      server.events.on('request:start', ({ request }) => {
        const u = new URL(request.url);
        urls.push(u.pathname + u.search);
      });
      renderApp('/production');
      await screen.findByRole('table', { name: fr['production.caption.toAssign'] });
      server.events.removeAllListeners();
      expect(urls.some((u) => /queue\?.*status=to_assign/.test(u))).toBe(true);
      expect(urls.some((u) => /queue\?.*status=in_production/.test(u))).toBe(true);
      expect(urls.some((u) => /\/admin\/orders(\?|$)/.test(u))).toBe(false);
    },
    SLOW,
  );

  it(
    'affiche l’opérateur et l’état du job, avec l’échec en évidence',
    async () => {
      patchDemoOrder(ID(5), {
        production: {
          status: 'failed',
          operator: { id: DEMO_OPERATORS[1]?.id ?? '', name: 'Admin' },
          error: 'Rendu impossible',
          items: [],
        },
      });
      loginAs('production');
      renderApp('/production');
      const inProgress = await screen.findByRole('table', {
        name: fr['production.caption.inProgress'],
      });
      const row = (await within(inProgress).findByText('TG-000005')).closest('tr');
      if (!row) throw new Error('ligne absente');
      expect(within(row).getByText('Admin')).toBeInTheDocument();
      const badge = within(row).getByText(fr['production.job.failed']);
      expect(badge).toHaveAttribute('data-job', 'failed');
      expect(badge.className).toContain('danger');
      const toAssign = screen.getByRole('table', { name: fr['production.caption.toAssign'] });
      expect(within(toAssign).getAllByText(fr['production.unassigned'])).toHaveLength(2);
    },
    SLOW,
  );

  it(
    'pagine par curseur avec « Charger la suite »',
    async () => {
      const item = (n: number): ProductionQueueItem => ({
        orderId: ID(n),
        orderNumber: `TG-00010${n}`,
        status: 'paid',
        receptionType: 'home',
        paidAt: '2026-11-20T10:00:00.000Z',
        itemsCount: 1,
        production: null,
      });
      server.use(
        http.get('*/v1/admin/production/queue', ({ request }) => {
          const u = new URL(request.url).searchParams;
          if (u.get('status') === 'in_production')
            return HttpResponse.json({ items: [], nextCursor: null });
          return u.get('cursor') === 'c2'
            ? HttpResponse.json({ items: [item(2)], nextCursor: null })
            : HttpResponse.json({ items: [item(1)], nextCursor: 'c2' });
        }),
      );
      loginAs('production');
      renderApp('/production');
      const user = userEvent.setup();
      expect(await screen.findByText('TG-000101')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Charger la suite/ }));
      expect(await screen.findByText('TG-000102')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Charger la suite/ })).not.toBeInTheDocument();
    },
    SLOW,
  );
});

describe('affectation : liste d’opérateurs', () => {
  it(
    'présélectionne l’utilisateur connecté et envoie l’opérateur choisi',
    async () => {
      loginAs('production');
      let body: unknown = null;
      server.events.on('request:start', async ({ request }) => {
        if (request.url.includes('assign-operator')) body = await request.clone().json();
      });
      renderApp('/production');
      const user = userEvent.setup();
      const select = await screen.findByLabelText(fr['production.operator']);
      await waitFor(() => expect(select).toHaveValue(demoUserId('production')));
      await user.selectOptions(select, demoUserId('super_admin'));
      await user.click(await screen.findByRole('button', { name: 'Affecter TG-000003' }));
      expect(await screen.findByText(fr['production.assigned'])).toBeInTheDocument();
      server.events.removeAllListeners();
      expect(body).toEqual({ operatorId: demoUserId('super_admin') });
      const inProgress = screen.getByRole('table', { name: fr['production.caption.inProgress'] });
      const row = (await within(inProgress).findByText('TG-000003')).closest('tr');
      expect(within(row as HTMLElement).getByText(op(demoUserId('super_admin')))).toBeVisible();
    },
    SLOW,
  );

  it(
    'permet de réaffecter une commande déjà en production',
    async () => {
      loginAs('super_admin');
      renderApp('/production');
      const user = userEvent.setup();
      const select = await screen.findByLabelText(fr['production.operator']);
      await waitFor(() => expect(select).toHaveValue(demoUserId('super_admin')));
      await user.click(await screen.findByRole('button', { name: 'Réaffecter TG-000005' }));
      expect(await screen.findByText(fr['production.reassigned'])).toBeInTheDocument();
      const inProgress = screen.getByRole('table', { name: fr['production.caption.inProgress'] });
      await waitFor(() => expect(within(inProgress).getByText('Admin')).toBeInTheDocument());
    },
    SLOW,
  );

  it(
    'propose la liste dans le dialogue de transition vers la production',
    async () => {
      loginAs('production');
      let body: unknown = null;
      server.events.on('request:start', async ({ request }) => {
        if (request.url.includes('assign-operator')) body = await request.clone().json();
      });
      renderApp(`/commandes/${ID(3)}`);
      const user = userEvent.setup();
      await user.click(
        await screen.findByRole('button', { name: fr['order.action.in_production'] }),
      );
      const dialog = await screen.findByRole('dialog', { name: fr['order.assign.title'] });
      const select = within(dialog).getByLabelText(fr['production.operator']);
      await waitFor(() => expect(select).toHaveValue(demoUserId('production')));
      await user.selectOptions(select, demoUserId('super_admin'));
      await user.click(within(dialog).getByRole('button', { name: fr['order.assign.confirm'] }));
      expect(await screen.findByText(fr['order.transitioned'])).toBeInTheDocument();
      server.events.removeAllListeners();
      expect(body).toEqual({ operatorId: demoUserId('super_admin') });
    },
    SLOW,
  );

  it(
    'réaffecte depuis le détail d’une commande en production',
    async () => {
      loginAs('production');
      renderApp(`/commandes/${ID(5)}`);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: fr['order.reassign.action'] }));
      const dialog = await screen.findByRole('dialog', { name: fr['order.reassign.title'] });
      await waitFor(() =>
        expect(within(dialog).getByLabelText(fr['production.operator'])).toHaveValue(
          demoUserId('production'),
        ),
      );
      await user.selectOptions(
        within(dialog).getByLabelText(fr['production.operator']),
        demoUserId('super_admin'),
      );
      await user.click(within(dialog).getByRole('button', { name: fr['order.reassign.confirm'] }));
      expect(await screen.findByText(fr['production.reassigned'])).toBeInTheDocument();
      const block = screen.getByRole('region', { name: fr['order.production'] });
      await waitFor(() => expect(within(block).getByText('Admin')).toBeInTheDocument());
    },
    SLOW,
  );

  it(
    'masque les actions d’affectation à l’équipe commandes',
    async () => {
      loginAs('order_manager');
      renderApp(`/commandes/${ID(5)}`);
      await screen.findByRole('heading', { name: /TG-000005/ });
      expect(
        screen.queryByRole('button', { name: fr['order.reassign.action'] }),
      ).not.toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'affiche OPERATOR_INVALID en français',
    async () => {
      loginAs('production');
      server.use(
        http.post('*/v1/admin/orders/:id/assign-operator', () =>
          HttpResponse.json(
            { error: { code: 'OPERATOR_INVALID', message: fr['error.OPERATOR_INVALID'] } },
            { status: 422 },
          ),
        ),
      );
      renderApp('/production');
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: 'Affecter TG-000003' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(fr['error.OPERATOR_INVALID']);
    },
    SLOW,
  );
});

describe('détail : blocs production, livraison, paiements', () => {
  it(
    'affiche opérateur, état du job, erreur et fichiers par article',
    async () => {
      patchDemoOrder(ID(5), {
        production: {
          status: 'failed',
          operator: { id: DEMO_OPERATORS[0]?.id ?? '', name: 'Awa Opératrice' },
          error: 'Police introuvable',
          items: [{ itemId: uid(555), front: true, back: false }],
        },
      });
      loginAs('order_manager');
      renderApp(`/commandes/${ID(5)}`);
      const block = await screen.findByRole('region', { name: fr['order.production'] });
      expect(within(block).getByText('Awa Opératrice')).toBeInTheDocument();
      expect(within(block).getByText(fr['production.job.failed'])).toBeInTheDocument();
      expect(within(block).getByRole('alert')).toHaveTextContent('Police introuvable');
      expect(within(block).getByText(/recto : présent · verso : absent/)).toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'affiche la livraison avec le livreur, ou son absence, et l’état vide des paiements',
    async () => {
      loginAs('logistics');
      renderApp(`/commandes/${ID(7)}`);
      const delivery = await screen.findByRole('region', { name: fr['order.delivery'] });
      expect(within(delivery).getByText('Koffi Livreur')).toBeInTheDocument();
      expect(within(delivery).getByText('out_for_delivery')).toBeInTheDocument();
      const payments = screen.getByRole('region', { name: fr['order.payments'] });
      expect(within(payments).getByText(fr['order.payments.empty'])).toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'liste les paiements quand l’API en renvoie',
    async () => {
      patchDemoOrder(ID(3), {
        payments: [
          {
            id: uid(990),
            method: 'tmoney',
            status: 'succeeded',
            amountXof: 15000,
            createdAt: '2026-11-20T10:00:00.000Z',
          },
        ],
      });
      loginAs('order_manager');
      renderApp(`/commandes/${ID(3)}`);
      const payments = await screen.findByRole('region', { name: fr['order.payments'] });
      expect(within(payments).getByText(/T-Money · succeeded/)).toBeInTheDocument();
      expect(within(payments).getByText(/15\s000\sFCFA/)).toBeInTheDocument();
    },
    SLOW,
  );
});

describe('préconditions vérifiées côté client (l’API reste juge)', () => {
  it(
    'désactive « Marquer prête » sans fichiers HD et l’explique',
    async () => {
      patchDemoOrder(ID(5), {
        production: {
          status: 'rendering',
          operator: { id: DEMO_OPERATORS[0]?.id ?? '', name: 'Awa Opératrice' },
          error: null,
          items: [{ itemId: uid(555), front: true, back: false }],
        },
      });
      loginAs('production');
      renderApp(`/commandes/${ID(5)}`);
      const btn = await screen.findByRole('button', { name: 'Marquer prête' });
      expect(btn).toBeDisabled();
      expect(btn).toHaveAccessibleDescription(fr['order.precondition.requiresPrintFiles']);
    },
    SLOW,
  );

  it(
    'active « Marquer prête » quand tous les fichiers requis sont présents',
    async () => {
      loginAs('production');
      renderApp(`/commandes/${ID(5)}`);
      expect(await screen.findByRole('button', { name: 'Marquer prête' })).toBeEnabled();
    },
    SLOW,
  );

  it(
    'désactive l’expédition sans livreur et l’explique',
    async () => {
      patchDemoOrder(ID(7), { status: 'ready', delivery: null });
      loginAs('logistics');
      renderApp(`/commandes/${ID(7)}`);
      const btn = await screen.findByRole('button', { name: 'Expédier' });
      expect(btn).toBeDisabled();
      expect(btn).toHaveAccessibleDescription(fr['order.precondition.requiresCourier']);
    },
    SLOW,
  );

  it(
    'active l’expédition quand un livreur est affecté',
    async () => {
      patchDemoOrder(ID(7), {
        status: 'ready',
        delivery: {
          status: 'assigned',
          courier: { id: uid(980), name: 'Koffi Livreur', phone: '+22891000000' },
        },
      } as Partial<AdminOrder>);
      loginAs('logistics');
      renderApp(`/commandes/${ID(7)}`);
      expect(await screen.findByRole('button', { name: 'Expédier' })).toBeEnabled();
    },
    SLOW,
  );
});

describe('erreurs typées du code de retrait', () => {
  it(
    'HANDOVER_CODE_LOCKED ferme le dialogue et affiche le message de blocage',
    async () => {
      loginAs('logistics');
      server.use(
        http.post('*/v1/admin/orders/:id/transitions', () =>
          HttpResponse.json(
            { error: { code: 'HANDOVER_CODE_LOCKED', message: fr['error.HANDOVER_CODE_LOCKED'] } },
            { status: 403 },
          ),
        ),
      );
      renderApp(`/commandes/${ID(6)}`);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: fr['order.action.delivered'] }));
      const dialog = await screen.findByRole('dialog', { name: fr['order.code.title'] });
      await user.type(within(dialog).getByLabelText(fr['order.code.label']), '123456');
      await user.click(within(dialog).getByRole('button', { name: fr['order.code.confirm'] }));
      expect(await screen.findByText(fr['error.HANDOVER_CODE_LOCKED'])).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    },
    SLOW,
  );
});
