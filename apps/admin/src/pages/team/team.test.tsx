import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fr } from '../../i18n/fr';
import { loginAs, renderApp } from '../../test-utils';

const SLOW = 15_000;

const rowOf = (table: HTMLElement, text: string) =>
  waitFor(() => {
    const row = within(table)
      .getAllByRole('row')
      .find((r) => r.textContent?.includes(text));
    if (!row) throw new Error(`ligne absente : ${text}`);
    return row;
  });

describe('équipe et journal d’audit', () => {
  it('403 pour le gestionnaire de commandes sur /equipe', async () => {
    loginAs('order_manager');
    renderApp('/equipe');
    expect(await screen.findByRole('heading', { name: fr['forbidden.title'] })).toBeInTheDocument();
  });

  it(
    'liste les comptes avec rôle, vérification et statut',
    async () => {
      loginAs('super_admin');
      renderApp('/equipe');
      const table = await screen.findByRole('region', { name: fr['team.accounts.caption'] });
      expect(await rowOf(table, 'logistique@streetwear.test')).toBeInTheDocument();
      expect(within(table).getAllByText(fr['team.status.active']).length).toBeGreaterThan(0);
      expect(within(table).getByText(fr['team.role.logistics'])).toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'valide le mot de passe et exige un téléphone pour un livreur',
    async () => {
      loginAs('super_admin');
      renderApp('/equipe');
      await userEvent.click(await screen.findByRole('button', { name: fr['team.account.add'] }));
      const form = screen.getByRole('form', { name: fr['team.account.new'] });
      await userEvent.type(
        within(form).getByLabelText(fr['team.form.email']),
        'nouveau@streetwear.test',
      );
      await userEvent.type(within(form).getByLabelText(fr['team.form.password']), 'court');
      await userEvent.click(within(form).getByRole('button', { name: fr['team.account.create'] }));
      expect(await within(form).findByText(fr['team.form.passwordFormat'])).toBeInTheDocument();

      await userEvent.selectOptions(within(form).getByLabelText(fr['team.form.role']), 'courier');
      await userEvent.clear(within(form).getByLabelText(fr['team.form.password']));
      await userEvent.type(
        within(form).getByLabelText(fr['team.form.password']),
        'motdepasse-12345',
      );
      await userEvent.click(within(form).getByRole('button', { name: fr['team.account.create'] }));
      expect(await within(form).findByText(fr['team.form.phoneFormat'])).toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'crée un compte et le fait apparaître dans la liste',
    async () => {
      loginAs('super_admin');
      renderApp('/equipe');
      await userEvent.click(await screen.findByRole('button', { name: fr['team.account.add'] }));
      const form = screen.getByRole('form', { name: fr['team.account.new'] });
      await userEvent.type(
        within(form).getByLabelText(fr['team.form.email']),
        'stock@streetwear.test',
      );
      await userEvent.type(within(form).getByLabelText(fr['team.form.name']), 'Stock');
      await userEvent.type(
        within(form).getByLabelText(fr['team.form.password']),
        'motdepasse-12345',
      );
      await userEvent.selectOptions(
        within(form).getByLabelText(fr['team.form.role']),
        'production',
      );
      await userEvent.click(within(form).getByRole('button', { name: fr['team.account.create'] }));
      expect(await screen.findByText(fr['team.saved'])).toBeInTheDocument();
      const table = screen.getByRole('region', { name: fr['team.accounts.caption'] });
      expect(await rowOf(table, 'stock@streetwear.test')).toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'affiche CANNOT_MODIFY_SELF quand l’admin tente de se désactiver',
    async () => {
      loginAs('super_admin');
      renderApp('/equipe');
      const table = await screen.findByRole('region', { name: fr['team.accounts.caption'] });
      const row = await rowOf(table, 'admin@streetwear.test');
      await userEvent.click(
        within(row).getByRole('button', {
          name: `${fr['team.action.disable']} admin@streetwear.test`,
        }),
      );
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(
        within(dialog).getByRole('button', { name: fr['team.action.disable'] }),
      );
      expect(await screen.findByText(fr['error.CANNOT_MODIFY_SELF'])).toBeInTheDocument();
      expect(row).toHaveTextContent(fr['team.status.active']);
    },
    SLOW,
  );

  it(
    'journal d’audit filtrable par entité',
    async () => {
      loginAs('super_admin');
      renderApp('/equipe');
      await userEvent.click(await screen.findByRole('button', { name: fr['team.tab.audit'] }));
      const table = await screen.findByRole('region', { name: fr['audit.caption'] });
      expect(await within(table).findByText('setting')).toBeInTheDocument();
      const filters = screen.getByRole('search', { name: fr['audit.filter.label'] });
      await userEvent.type(within(filters).getByLabelText(fr['audit.filter.entity']), 'pattern');
      await userEvent.click(within(filters).getByRole('button', { name: fr['filter.apply'] }));
      await waitFor(() => expect(within(table).queryByText('setting')).not.toBeInTheDocument());
      expect(within(table).getByText('pattern')).toBeInTheDocument();
    },
    SLOW,
  );
});
