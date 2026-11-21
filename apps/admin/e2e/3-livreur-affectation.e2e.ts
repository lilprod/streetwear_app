import { expect, test } from '@playwright/test';
import { findOrders, orderDetail, signIn } from './support/helpers';

test.describe('Parcours C : affectation d’un livreur', () => {
  test('la logistique affecte le livreur depuis la liste des livraisons', async ({ page }) => {
    const [order] = await findOrders({ status: 'deposit_paid', reception: 'home' });
    expect(order, 'commande à domicile avec acompte du jeu de démo').toBeDefined();
    const number = order?.number as string;
    expect((await orderDetail(order?.id as string)).delivery?.courier).toBeNull();

    await signIn(page, 'logistics');
    await page
      .getByRole('navigation', { name: 'Navigation principale' })
      .getByRole('link', { name: 'Livraisons' })
      .click();

    const row = page.getByRole('row').filter({ hasText: number });
    await expect(row).toContainText('Non affecté');
    await page.getByRole('button', { name: `Affecter ${number}` }).click();

    await expect(page.getByText('Livreur affecté : la commande peut être expédiée.')).toBeVisible();
    await expect(row).not.toContainText('Non affecté');
    await expect(page.getByRole('button', { name: `Réaffecter ${number}` })).toBeVisible();

    const after = await orderDetail(order?.id as string);
    expect(after.delivery?.courier?.name).toBeTruthy();
    expect(after.delivery?.status).toBe('assigned');
  });
});
