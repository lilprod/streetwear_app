import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fr } from '../../i18n/fr';
import { setUploadConfigured } from '../../mocks/catalog-handlers';
import { loginAs, renderApp } from '../../test-utils';

vi.mock('../../lib/catalog-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catalog-api')>();
  return {
    ...actual,
    uploadToProvider: vi.fn(async () => ({
      public_id: 'patterns/wax-aflao',
      format: 'png',
      bytes: 1200,
      width: 2000,
      height: 2000,
    })),
  };
});

const SLOW = 15_000;

const rowOf = (table: HTMLElement, text: string) =>
  waitFor(() => {
    const row = within(table)
      .getAllByRole('row')
      .find((r) => r.textContent?.includes(text));
    if (!row) throw new Error(`ligne absente : ${text}`);
    return row;
  });

describe('catalogue', () => {
  it('403 pour le gestionnaire de commandes sur /catalogue', async () => {
    loginAs('order_manager');
    renderApp('/catalogue');
    expect(await screen.findByRole('heading', { name: fr['forbidden.title'] })).toBeInTheDocument();
  });

  it(
    'liste les motifs avec droits manquants et statut',
    async () => {
      loginAs('super_admin');
      renderApp('/catalogue');
      const table = await screen.findByRole('region', { name: fr['catalog.patterns.caption'] });
      const row = await rowOf(table, 'Kente Lomé');
      if (!row) throw new Error('ligne absente');
      expect(within(row).getByText(fr['catalog.status.active'])).toBeInTheDocument();
      const off = await rowOf(table, 'Fleurs de Kpalimé');
      if (!off) throw new Error('ligne absente');
      expect(within(off).getByText(fr['catalog.rights.missing'])).toBeInTheDocument();
      expect(within(off).getByText(fr['catalog.status.inactive'])).toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'désactive un motif après confirmation',
    async () => {
      loginAs('super_admin');
      renderApp('/catalogue');
      const table = await screen.findByRole('region', { name: fr['catalog.patterns.caption'] });
      const row = await rowOf(table, 'Kente Lomé');
      if (!row) throw new Error('ligne absente');
      await userEvent.click(
        within(row).getByRole('button', { name: `${fr['catalog.action.deactivate']} Kente Lomé` }),
      );
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(
        within(dialog).getByRole('button', { name: fr['catalog.action.deactivate'] }),
      );
      expect(await screen.findByText(fr['catalog.pattern.deactivated'])).toBeInTheDocument();
      await waitFor(async () =>
        expect(await rowOf(table, 'Kente Lomé')).toHaveTextContent(fr['catalog.status.inactive']),
      );
    },
    SLOW,
  );

  it(
    'refuse l’activation sans droits avec les raisons de l’API',
    async () => {
      loginAs('super_admin');
      renderApp('/catalogue');
      const table = await screen.findByRole('region', { name: fr['catalog.patterns.caption'] });
      const off = await rowOf(table, 'Fleurs de Kpalimé');
      if (!off) throw new Error('ligne absente');
      await userEvent.click(
        within(off).getByRole('button', {
          name: `${fr['catalog.action.activate']} Fleurs de Kpalimé`,
        }),
      );
      expect(
        await screen.findByText(new RegExp(fr['catalog.reason.RIGHTS_HOLDER_MISSING'])),
      ).toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'ajoute un motif : signature, envoi Cloudinary puis création',
    async () => {
      loginAs('super_admin');
      renderApp('/catalogue');
      await userEvent.click(await screen.findByRole('button', { name: fr['catalog.pattern.add'] }));
      const form = screen.getByRole('form', { name: fr['catalog.pattern.new'] });
      await userEvent.type(within(form).getByLabelText(fr['catalog.form.name']), 'Wax Aflao');
      await userEvent.selectOptions(
        within(form).getByLabelText(fr['catalog.form.category']),
        'Floral',
      );
      await userEvent.upload(
        within(form).getByLabelText(fr['catalog.form.file']),
        new File(['png'], 'wax.png', { type: 'image/png' }),
      );
      await userEvent.type(
        within(form).getByLabelText(fr['catalog.form.rightsHolder']),
        'Atelier Aflao',
      );
      await userEvent.click(within(form).getByRole('button', { name: fr['catalog.form.submit'] }));
      expect(
        await screen.findByText(fr['catalog.created'], {}, { timeout: 10_000 }),
      ).toBeInTheDocument();
      const table = await screen.findByRole('region', { name: fr['catalog.patterns.caption'] });
      expect(await rowOf(table, 'Wax Aflao')).toBeInTheDocument();
    },
    SLOW,
  );

  it(
    'mode dégradé si le téléversement n’est pas configuré',
    async () => {
      loginAs('super_admin');
      setUploadConfigured(false);
      renderApp('/catalogue');
      await userEvent.click(await screen.findByRole('button', { name: fr['catalog.pattern.add'] }));
      const form = screen.getByRole('form', { name: fr['catalog.pattern.new'] });
      await userEvent.type(within(form).getByLabelText(fr['catalog.form.name']), 'Test');
      await userEvent.selectOptions(
        within(form).getByLabelText(fr['catalog.form.category']),
        'Floral',
      );
      await userEvent.upload(
        within(form).getByLabelText(fr['catalog.form.file']),
        new File(['x'], 'motif.png', { type: 'image/png' }),
      );
      await userEvent.click(within(form).getByRole('button', { name: fr['catalog.form.submit'] }));
      expect(await screen.findByText(fr['catalog.upload.unconfigured'])).toBeInTheDocument();
      setUploadConfigured(true);
    },
    SLOW,
  );

  it(
    'refuse un mot interdit de moins de 3 caractères',
    async () => {
      loginAs('super_admin');
      renderApp('/catalogue');
      await userEvent.click(await screen.findByRole('button', { name: fr['catalog.tab.banned'] }));
      await userEvent.type(screen.getByLabelText(fr['catalog.banned.word']), 'ab');
      await userEvent.click(screen.getByRole('button', { name: fr['catalog.banned.add'] }));
      expect(await screen.findByText(fr['catalog.banned.minLength'])).toBeInTheDocument();
    },
    SLOW,
  );
});
