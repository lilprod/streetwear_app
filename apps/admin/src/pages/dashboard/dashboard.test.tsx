import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FIXTURE_ORDERS, formatXof } from '@streetwear/shared';
import { fr } from '../../i18n/fr';
import { loginAs, renderApp } from '../../test-utils';

const SLOW = 15_000;

describe('tableau de bord', () => {
  it(
    'affiche les indicateurs, les répartitions et les motifs et couleurs les plus vendus',
    async () => {
      loginAs('order_manager');
      renderApp('/');
      expect(
        await screen.findByRole('heading', { name: fr['dashboard.title'] }),
      ).toBeInTheDocument();
      const kpis = await screen.findByText(fr['dashboard.revenue']);
      const dl = kpis.closest('dl');
      if (!dl) throw new Error('dl absent');
      const total = FIXTURE_ORDERS.reduce((s, o) => s + o.totalXof, 0);
      expect(
        within(dl).getByText(
          (_, el) =>
            el?.tagName === 'DD' &&
            el.textContent?.replace(/\s/g, '') === formatXof(total).replace(/\s/g, ''),
        ),
      ).toBeInTheDocument();
      expect(await screen.findByRole('img', { name: /Kente Lomé 42/ })).toBeInTheDocument();
      expect(screen.getByRole('img', { name: /Blanc 55/ })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: fr['dashboard.byStatus'] })).toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'applique une période et met à jour le nombre de commandes',
    async () => {
      loginAs('super_admin');
      renderApp('/');
      const dl = (await screen.findByText(fr['dashboard.orders'], { selector: 'dt' })).closest(
        'dl',
      );
      if (!dl) throw new Error('dl absent');
      await waitFor(() =>
        expect(
          within(dl).getByText(String(FIXTURE_ORDERS.length), { selector: 'dd' }),
        ).toBeInTheDocument(),
      );
      const period = screen.getByRole('search', { name: fr['dashboard.period'] });
      fireEvent.change(within(period).getByLabelText(fr['dashboard.from']), {
        target: { value: '2030-01-01' },
      });
      await userEvent.click(within(period).getByRole('button', { name: fr['dashboard.apply'] }));
      await waitFor(() =>
        expect(within(dl).getByText('0', { selector: 'dd' })).toBeInTheDocument(),
      );
    },
    SLOW,
  );
});
