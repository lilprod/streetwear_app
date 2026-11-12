import { screen, waitFor, within } from '@testing-library/react';
import { formatXof } from '@streetwear/shared';
import userEvent from '@testing-library/user-event';
import { fr } from '../../i18n/fr';
import { loginAs, renderApp } from '../../test-utils';

const SLOW = 15_000;
const amount = (n: number) => (_: string, el: Element | null) =>
  el?.tagName === 'SPAN' && el.textContent?.replace(/\s/g, '') === formatXof(n).replace(/\s/g, '');

describe('paiements', () => {
  it('403 pour le livreur sur /paiements', async () => {
    loginAs('courier');
    renderApp('/paiements');
    expect(await screen.findByRole('heading', { name: fr['forbidden.title'] })).toBeInTheDocument();
  });

  it('403 pour la production sur /paiements', async () => {
    loginAs('production');
    renderApp('/paiements');
    expect(await screen.findByRole('heading', { name: fr['forbidden.title'] })).toBeInTheDocument();
  });

  it(
    'journal : statuts, montants FCFA et numéros masqués tels que renvoyés',
    async () => {
      loginAs('order_manager');
      renderApp('/paiements');
      const table = await screen.findByRole('region', { name: fr['payments.journal.caption'] });
      expect(await within(table).findByText('SW-2026-0101')).toBeInTheDocument();
      expect(within(table).getByText('+228 90 •• •• 56')).toBeInTheDocument();
      expect(within(table).getAllByText(fr['payments.status.failed']).length).toBeGreaterThan(0);
    },
    SLOW,
  );

  it(
    'filtre le journal par statut',
    async () => {
      loginAs('super_admin');
      renderApp('/paiements');
      const table = await screen.findByRole('region', { name: fr['payments.journal.caption'] });
      await within(table).findByText('SW-2026-0101');
      const filters = screen.getByRole('search', { name: fr['payments.filter.label'] });
      await userEvent.selectOptions(
        within(filters).getByLabelText(fr['payments.filter.status']),
        'failed',
      );
      await userEvent.click(within(filters).getByRole('button', { name: fr['filter.apply'] }));
      await waitFor(() =>
        expect(within(table).queryByText('SW-2026-0101')).not.toBeInTheDocument(),
      );
      expect(within(table).getByText('SW-2026-0103')).toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'rapprochements : écarts en évidence avec type, montants et référence',
    async () => {
      loginAs('super_admin');
      renderApp('/paiements');
      await userEvent.click(
        await screen.findByRole('button', { name: fr['payments.tab.reconciliations'] }),
      );
      expect(await screen.findByText(`${fr['payments.rec.mismatchBadge']} 3`)).toBeInTheDocument();
      const mismatches = await screen.findByRole('region', {
        name: new RegExp(fr['payments.mis.caption']),
      });
      expect(within(mismatches).getByText(fr['payments.mis.amount_mismatch'])).toBeInTheDocument();
      expect(
        within(mismatches).getByText(fr['payments.mis.missing_at_provider']),
      ).toBeInTheDocument();
      expect(within(mismatches).getByText('TM-0099')).toBeInTheDocument();
      expect(within(mismatches).getByText(amount(12500))).toBeInTheDocument();
    },
    SLOW,
  );
});
