import { expect, test } from '@playwright/test';
import { findOrders, orderStatus, signIn } from './support/helpers';

test.describe('Parcours B : changement de statut selon le rôle', () => {
  test('la logistique ne voit que les boutons autorisés et fait passer une commande retrait à « Prête au retrait »', async ({
    page,
  }) => {
    const [pickup] = await findOrders({ status: 'ready', reception: 'pickup' });
    const [paid] = await findOrders({ status: 'paid' });
    expect(pickup, 'commande retrait « Prête » du jeu de démo').toBeDefined();
    expect(paid, 'commande « Payée » du jeu de démo').toBeDefined();

    await signIn(page, 'logistics');

    await page.goto(`/commandes/${paid?.id}`);
    await expect(
      page.getByRole('heading', { name: `Commande ${paid?.number}`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Affecter et lancer la production' }),
    ).toHaveCount(0);

    await page.goto(`/commandes/${pickup?.id}`);
    await expect(
      page.getByRole('heading', { name: `Commande ${pickup?.number}`, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Marquer prête' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Expédier' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Prête au retrait' }).click();

    await expect(page.getByText('Statut mis à jour.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Marquer livrée' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Prête au retrait' })).toHaveCount(0);
    expect(await orderStatus(pickup?.id as string)).toBe('ready_for_pickup');
  });

  test('le retrait exige un code à 6 chiffres avant « Livrée »', async ({ page }) => {
    const [order] = await findOrders({ status: 'ready_for_pickup', reception: 'pickup' });
    await signIn(page, 'logistics');
    await page.goto(`/commandes/${order?.id}`);
    await page.getByRole('button', { name: 'Marquer livrée' }).click();
    await page.getByLabel('Code de retrait (6 chiffres)').fill('123');
    await page.getByRole('button', { name: 'Valider la remise' }).click();
    await expect(page.getByRole('alert')).toContainText('6 chiffres');
    expect(await orderStatus(order?.id as string)).toBe('ready_for_pickup');
  });
});
