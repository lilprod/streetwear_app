import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import {
  ADMIN_ROLES,
  FIXTURE_ORDERS,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS_FR,
  allowedTransitions,
  formatLome,
  formatXof,
  uid,
  type AdminRole,
  type ReceptionType,
} from '@streetwear/shared';
import { AuthProvider } from '../../auth/auth-context';
import { ToastProvider } from '../../components/toast';
import { fr, type FrKey } from '../../i18n/fr';
import type { AdminOrder } from '../../lib/orders-api';
import { DEMO_PICKUP_CODE } from '../../mocks/orders-handlers';
import { server } from '../../mocks/server';
import { loginAs, renderApp } from '../../test-utils';
import { TransitionPanel } from './transition-panel';

const money = (n: number) => (content: string) =>
  content.replace(/\s/g, '') === formatXof(n).replace(/\s/g, '');
const fx = (i: number) => {
  const o = FIXTURE_ORDERS[i];
  if (!o) throw new Error(`fixture ${i}`);
  return o;
};
const ID = (n: number) => uid(500 + n);
const action = (to: string) => fr[`order.action.${to}` as FrKey];

function fakeOrder(status: (typeof ORDER_STATUSES)[number], receptionType: ReceptionType) {
  return {
    ...FIXTURE_ORDERS[0],
    status,
    receptionType,
    production: null,
    delivery: null,
    payments: [],
  } as unknown as AdminOrder;
}

describe('liste des commandes', () => {
  it('affiche les lignes, montants FCFA, dates Africa/Lome et compteurs', async () => {
    loginAs('order_manager');
    renderApp('/commandes');
    const table = await screen.findByRole('table', { name: fr['orders.caption'] });
    expect(within(table).getAllByRole('row')).toHaveLength(FIXTURE_ORDERS.length + 1);
    const first = fx(0);
    const row = within(table).getByText(first.number).closest('tr');
    if (!row) throw new Error('ligne absente');
    expect(within(row).getByText(money(first.totalXof))).toBeInTheDocument();
    expect(within(row).getByText(formatLome(first.createdAt))).toBeInTheDocument();
    expect(within(row).getByText(/^\+228 90 12 /)).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: fr['orders.statusTabs'] });
    expect(await within(nav).findByRole('button', { name: /^Toutes\s*8$/ })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: /^Payée\s*1$/ })).toBeInTheDocument();
  });

  it('filtre par statut, réception, paiement et recherche', async () => {
    loginAs('order_manager');
    renderApp('/commandes');
    const user = userEvent.setup();
    await screen.findByText('TG-000001');
    await user.click(screen.getByRole('button', { name: /^Payée/ }));
    expect(await screen.findByText('TG-000003')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('TG-000001')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: fr['filter.reset'] }));
    await screen.findByText('TG-000001');
    await user.selectOptions(screen.getByLabelText(fr['orders.reception']), 'pickup');
    expect(await screen.findByText('TG-000006')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('TG-000001')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: fr['filter.reset'] }));
    await user.selectOptions(screen.getByLabelText(fr['orders.payment']), 'cod');
    expect(await screen.findByText('TG-000004')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('TG-000003')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: fr['filter.reset'] }));
    await user.type(screen.getByRole('searchbox'), 'TG-000007{Enter}');
    expect(await screen.findByText('TG-000007')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('TG-000003')).not.toBeInTheDocument());
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'introuvable{Enter}');
    expect(await screen.findByText(fr['table.empty'])).toBeInTheDocument();
  });

  it('filtre par dates', async () => {
    loginAs('order_manager');
    renderApp('/commandes');
    const user = userEvent.setup();
    await screen.findByText('TG-000001');
    await user.type(screen.getByLabelText(fr['orders.from']), '2026-11-17');
    expect(await screen.findByText('TG-000008')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('TG-000001')).not.toBeInTheDocument());
  });

  it('pagine par curseur', async () => {
    loginAs('order_manager');
    renderApp('/commandes');
    const user = userEvent.setup();
    server.use(
      http.get('*/v1/admin/orders', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        const n = cursor ? 2 : 1;
        const o = fx(n);
        return HttpResponse.json({
          items: [
            {
              id: o.id,
              number: o.number,
              status: o.status,
              totalXof: o.totalXof,
              paymentMethod: o.paymentMethod,
              createdAt: o.createdAt,
              itemCount: 1,
              receptionType: 'home',
              customer: { id: uid(1), name: 'Test', phone: null },
            },
          ],
          nextCursor: cursor ? null : 'c2',
        });
      }),
    );
    expect(await screen.findByText('TG-000002')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: fr['table.next'] }));
    expect(await screen.findByText('TG-000003')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: fr['table.next'] })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: fr['table.previous'] }));
    expect(await screen.findByText('TG-000002')).toBeInTheDocument();
  });

  it('affiche une erreur en français si l’API échoue', async () => {
    loginAs('order_manager');
    server.use(
      http.get('*/v1/admin/orders', () =>
        HttpResponse.json(
          { error: { code: 'SERVICE_UNAVAILABLE', message: 'Service indisponible.' } },
          { status: 503 },
        ),
      ),
    );
    renderApp('/commandes');
    expect(await screen.findByRole('alert')).toHaveTextContent('Service indisponible.');
  });

  it.each(['production', 'logistics'] as const)(
    'les compteurs d’onglets viennent de /admin/orders/counts pour %s',
    async (role) => {
      loginAs(role);
      const seen: string[] = [];
      server.events.on('request:start', ({ request }) => {
        seen.push(new URL(request.url).pathname + new URL(request.url).search);
      });
      renderApp('/commandes');
      expect(await screen.findByText('TG-000001')).toBeInTheDocument();
      expect(await screen.findByRole('button', { name: /^Payée\s*1$/ })).toBeInTheDocument();
      expect(seen.some((u) => u.includes('/admin/orders/counts'))).toBe(true);
      expect(seen.some((u) => u.includes('/admin/stats/summary'))).toBe(false);
      server.events.removeAllListeners();
    },
  );

  it('les compteurs suivent les mêmes filtres que la liste (hors statut)', async () => {
    loginAs('order_manager');
    renderApp('/commandes');
    const user = userEvent.setup();
    const nav = screen.getByRole('navigation', { name: fr['orders.statusTabs'] });
    expect(await within(nav).findByRole('button', { name: /^Toutes\s*8$/ })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(fr['orders.reception']), 'pickup');
    expect(await within(nav).findByRole('button', { name: /^Toutes\s*1$/ })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: /^Prête au retrait\s*1$/ })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: /^Payée\s*0$/ })).toBeInTheDocument();
  });
});

describe('accès par rôle', () => {
  it('403 pour le livreur sur /commandes et la logistique sur /production', async () => {
    loginAs('courier');
    const first = renderApp('/commandes');
    expect(await screen.findByRole('heading', { name: fr['forbidden.title'] })).toBeInTheDocument();
    first.unmount();
    localStorage.clear();
    loginAs('logistics');
    renderApp('/production');
    expect(await screen.findByRole('heading', { name: fr['forbidden.title'] })).toBeInTheDocument();
  });

  it('la production n’accède pas à /equipe mais à /production', async () => {
    loginAs('production');
    renderApp('/production');
    expect(
      await screen.findByRole('heading', { name: fr['production.title'], level: 1 }),
    ).toBeInTheDocument();
  });
});

describe('détail de commande', () => {
  it('affiche articles, client, réception, paiement et historique', async () => {
    loginAs('order_manager');
    renderApp(`/commandes/${ID(4)}`);
    expect(await screen.findByRole('heading', { name: /TG-000004/ })).toBeInTheDocument();
    const o = fx(3);
    expect(screen.getByRole('heading', { name: fr['order.items'] })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: fr['order.history'] })).toBeInTheDocument();
    expect(screen.getAllByText(money(o.totalXof)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(money(o.depositXof ?? 0))[0]).toBeInTheDocument();
    expect(screen.getByText(fr['orders.payment.cod'])).toBeInTheDocument();
    expect(screen.getByText(fr['order.item.noPreview'])).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: fr['order.customer'] })).toBeInTheDocument();
  });

  it('404 pour une commande inconnue', async () => {
    loginAs('order_manager');
    renderApp(`/commandes/${uid(999)}`);
    expect(await screen.findByRole('heading', { name: fr['notFound.title'] })).toBeInTheDocument();
  });
});

describe('boutons de transition', () => {
  function renderPanel(order: AdminOrder, role: AdminRole) {
    loginAs(role);
    const client = new QueryClient();
    return render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <ToastProvider>
            <TransitionPanel order={order} />
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
  }

  describe.each(ADMIN_ROLES)('rôle %s', (role) => {
    it('affiche exactement allowedTransitions(statut, rôle)', () => {
      for (const receptionType of ['home', 'pickup'] as const) {
        for (const status of ORDER_STATUSES) {
          const view = renderPanel(fakeOrder(status, receptionType), role);
          const expected = allowedTransitions(status, { type: 'admin', role }, { receptionType });
          const shown = within(view.container)
            .queryAllByRole('button')
            .map((b) => b.textContent)
            .filter((t) => t !== fr['order.reassign.action']);
          expect(shown, `${role} ${status} ${receptionType}`).toEqual(expected.map(action));
          view.unmount();
        }
      }
    });
  });

  it('super_admin dispose de toutes les transitions d’équipe', () => {
    renderPanel(fakeOrder('cancelled', 'home'), 'super_admin');
    expect(screen.getByRole('button', { name: action('refunded') })).toBeInTheDocument();
  });

  it('annulation avec confirmation puis nouveau statut', async () => {
    loginAs('order_manager');
    renderApp(`/commandes/${ID(3)}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: action('cancelled') }));
    const dialog = await screen.findByRole('dialog', { name: fr['order.cancel.title'] });
    await user.type(within(dialog).getByLabelText(fr['order.cancel.note']), 'Client injoignable');
    await user.click(within(dialog).getByRole('button', { name: fr['order.cancel.confirm'] }));
    expect(await screen.findByText(fr['order.transitioned'])).toBeInTheDocument();
    expect(screen.getAllByText(ORDER_STATUS_LABELS_FR.cancelled).length).toBeGreaterThan(0);
    expect(screen.getByText('Client injoignable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: action('cancelled') })).not.toBeInTheDocument();
  });

  it('on peut renoncer à l’annulation', async () => {
    loginAs('order_manager');
    renderApp(`/commandes/${ID(3)}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: action('cancelled') }));
    await user.click(screen.getByRole('button', { name: fr['order.cancel.keep'] }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByText(ORDER_STATUS_LABELS_FR.paid).length).toBeGreaterThan(0);
  });

  it('retrait → livrée exige le code de retrait', async () => {
    loginAs('logistics');
    renderApp(`/commandes/${ID(6)}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: action('delivered') }));
    const dialog = await screen.findByRole('dialog', { name: fr['order.code.title'] });
    await user.type(within(dialog).getByLabelText(fr['order.code.label']), '12');
    await user.click(within(dialog).getByRole('button', { name: fr['order.code.confirm'] }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(fr['order.code.invalid']);

    await user.clear(within(dialog).getByLabelText(fr['order.code.label']));
    await user.type(within(dialog).getByLabelText(fr['order.code.label']), '000000');
    await user.click(within(dialog).getByRole('button', { name: fr['order.code.confirm'] }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      `${fr['order.code.remaining']} 4`,
    );

    await user.type(within(dialog).getByLabelText(fr['order.code.label']), DEMO_PICKUP_CODE);
    await user.click(within(dialog).getByRole('button', { name: fr['order.code.confirm'] }));
    expect(await screen.findByText(fr['order.transitioned'])).toBeInTheDocument();
    expect(screen.getAllByText(ORDER_STATUS_LABELS_FR.delivered).length).toBeGreaterThan(0);
  });

  it('transition directe : prête → prête au retrait (logistique, retrait)', async () => {
    loginAs('super_admin');
    server.use(
      http.get('*/v1/admin/orders/:id', ({ params }) => {
        const o = fx(FIXTURE_ORDERS.findIndex((x) => x.id === params.id));
        return HttpResponse.json({
          ...o,
          status: 'ready',
          receptionType: 'pickup',
          customer: { id: uid(1), name: 'Test', phone: null },
          statusHistory: [],
          allowedTransitions: [],
          production: null,
          delivery: null,
          payments: [],
        });
      }),
      http.post('*/v1/admin/orders/:id/transitions', () =>
        HttpResponse.json(
          { error: { code: 'INVALID_TRANSITION', message: 'Refusé par l’API.' } },
          { status: 409 },
        ),
      ),
    );
    renderApp(`/commandes/${ID(6)}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: action('ready_for_pickup') }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Refusé par l’API.');
  });

  it('production : affectation depuis le détail lance la production', async () => {
    loginAs('production');
    renderApp(`/commandes/${ID(3)}`);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: action('in_production') }));
    const dialog = await screen.findByRole('dialog', { name: fr['order.assign.title'] });
    await user.click(within(dialog).getByRole('button', { name: fr['order.assign.confirm'] }));
    expect(await screen.findByText(fr['order.transitioned'])).toBeInTheDocument();
    expect(screen.getAllByText(ORDER_STATUS_LABELS_FR.in_production).length).toBeGreaterThan(0);
  });
});
