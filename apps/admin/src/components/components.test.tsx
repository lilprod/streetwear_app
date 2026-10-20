import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ORDER_STATUSES, ORDER_STATUS_LABELS_FR } from '@streetwear/shared';
import { createColumnHelper } from '@tanstack/react-table';
import { ConfirmDialog } from './confirm-dialog';
import { DataTable } from './data-table';
import { FilterBar } from './filter-bar';
import { KpiCard } from './kpi-card';
import { StatusBadge } from './status-badge';
import { ToastProvider, useToast } from './toast';
import { ApiRequestError, errorFromBody, errorMessage } from '../lib/errors';
import { fr } from '../i18n/fr';

type Row = { name: string; qty: number };
const col = createColumnHelper<Row>();
const columns = [
  col.accessor('name', { header: 'Nom' }),
  col.accessor('qty', { header: 'Quantité' }),
];

describe('StatusBadge', () => {
  it.each(ORDER_STATUSES)('affiche le libellé de %s', (s) => {
    render(<StatusBadge status={s} />);
    expect(screen.getByText(ORDER_STATUS_LABELS_FR[s])).toBeInTheDocument();
  });
});

describe('DataTable', () => {
  it('trie, affiche l’état vide et pagine par curseur', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(
      <DataTable
        caption="Test"
        columns={columns}
        data={[
          { name: 'b', qty: 2 },
          { name: 'a', qty: 1 },
        ]}
        hasNext
        onNext={onNext}
        onPrevious={() => undefined}
      />,
    );
    const body = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.textContent);
    expect(body()[0]).toContain('b');
    await user.click(screen.getByRole('button', { name: /Nom/ }));
    expect(body()[0]).toContain('a');
    expect(screen.getByRole('columnheader', { name: /Nom/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await user.click(screen.getByRole('button', { name: fr['table.next'] }));
    expect(onNext).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: fr['table.previous'] })).toBeDisabled();
  });

  it('état vide', () => {
    render(<DataTable caption="Vide" columns={columns} data={[]} />);
    expect(screen.getByText(fr['table.empty'])).toBeInTheDocument();
  });
});

describe('FilterBar', () => {
  it('recherche et réinitialise', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    const onSubmit = vi.fn();
    function Wrapper() {
      const [q, setQ] = useState('');
      return <FilterBar search={q} onSearchChange={setQ} onReset={onReset} onSubmit={onSubmit} />;
    }
    render(<Wrapper />);
    await user.type(screen.getByLabelText(fr['filter.search']), 'TG-1{Enter}');
    expect(onSubmit).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: fr['filter.reset'] }));
    expect(onReset).toHaveBeenCalled();
  });
});

describe('KpiCard', () => {
  it('affiche libellé et valeur', () => {
    render(
      <dl>
        <KpiCard label="Commandes" value={12} />
      </dl>,
    );
    expect(screen.getByText('Commandes')).toBeInTheDocument();
    expect(screen.getByText('12')).toHaveClass('font-mono');
  });
});

describe('ConfirmDialog', () => {
  it('confirme, annule avec Échap et garde le focus dans la boîte', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="Annuler ?" onConfirm={onConfirm} onCancel={onCancel} />);
    const dialog = screen.getByRole('dialog', { name: 'Annuler ?' });
    expect(within(dialog).getByRole('button', { name: fr['dialog.cancel'] })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: fr['dialog.confirm'] })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: fr['dialog.cancel'] })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: fr['dialog.confirm'] }));
    expect(onConfirm).toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('Toast', () => {
  it('affiche puis ferme une notification', async () => {
    const user = userEvent.setup();
    function Btn() {
      const { show } = useToast();
      return <button onClick={() => show('Enregistré', 'success')}>go</button>;
    }
    render(
      <ToastProvider>
        <Btn />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'go' }));
    expect(screen.getByRole('status')).toHaveTextContent('Enregistré');
    await user.click(screen.getByRole('button', { name: fr['toast.close'] }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('erreurs API', () => {
  it('utilise le message de l’API, sinon le français par code', () => {
    const withMsg = errorFromBody(409, {
      error: { code: 'SLOT_FULL', message: 'Créneau complet.' },
    });
    expect(withMsg).toBeInstanceOf(ApiRequestError);
    expect(errorMessage(withMsg)).toBe('Créneau complet.');
    expect(errorMessage(errorFromBody(409, { error: { code: 'INVALID_TRANSITION' } }))).toBe(
      fr['error.INVALID_TRANSITION'],
    );
    expect(errorMessage(errorFromBody(500, 'oops'))).toBe(fr['error.unknown']);
    expect(errorMessage(new TypeError('fetch failed'))).toBe(fr['error.network']);
  });
});
