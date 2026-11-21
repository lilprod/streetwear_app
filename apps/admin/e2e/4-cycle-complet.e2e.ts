import { expect, test } from '@playwright/test';
import { findOrders, lastSmsCode, orderDetail, orderStatus, signIn } from './support/helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Parcours D : cycle complet d’une commande payée jusqu’à « Livrée »', () => {
  let orderId = '';
  let number = '';
  let phone = '';

  test('production : affectation d’un opérateur, fichiers HD, « Prête »', async ({ page }) => {
    const [order] = await findOrders({ status: 'paid', reception: 'home' });
    expect(order, 'commande à domicile « Payée » du jeu de démo').toBeDefined();
    orderId = order?.id as string;
    number = order?.number as string;
    phone = (await orderDetail(orderId)).customer.phone;

    await signIn(page, 'production');
    await page.goto(`/commandes/${orderId}`);
    await expect(
      page.getByRole('heading', { name: `Commande ${number}`, exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Affecter et lancer la production' }).click();
    await page.getByRole('button', { name: 'Affecter et lancer', exact: true }).click();
    await expect(page.getByText('Statut mis à jour.')).toBeVisible();
    expect(await orderStatus(orderId)).toBe('in_production');

    // The render worker produces the HD files (assets served from the local cache, see docs/qa/e2e.md).
    await expect
      .poll(
        async () => {
          const p = (await orderDetail(orderId)).production;
          return !!p && p.items.length > 0 && p.items.every((i) => i.front);
        },
        { timeout: 60_000, intervals: [1_000] },
      )
      .toBe(true);

    await page.reload();
    await page.getByRole('button', { name: 'Marquer prête' }).click();
    await expect(page.getByText('Statut mis à jour.')).toBeVisible();
    expect(await orderStatus(orderId)).toBe('ready');
  });

  test('logistique : affectation du livreur puis expédition', async ({ page }) => {
    await signIn(page, 'logistics');
    await page.goto(`/commandes/${orderId}`);
    await expect(page.getByRole('button', { name: 'Expédier' })).toBeDisabled();

    await page
      .getByRole('navigation', { name: 'Navigation principale' })
      .getByRole('link', { name: 'Livraisons' })
      .click();
    await page.getByRole('button', { name: `Affecter ${number}` }).click();
    await expect(page.getByText('Livreur affecté : la commande peut être expédiée.')).toBeVisible();

    await page.goto(`/commandes/${orderId}`);
    await page.getByRole('button', { name: 'Expédier' }).click();
    await expect(page.getByText('Statut mis à jour.')).toBeVisible();
    expect(await orderStatus(orderId)).toBe('shipped');
  });

  test('livreur à 360 px : code faux refusé puis bon code, commande « Livrée »', async ({
    browser,
  }) => {
    const since = Date.now() - 120_000;
    await expect
      .poll(() => lastSmsCode(phone, since), { timeout: 30_000, intervals: [500] })
      .not.toBeNull();
    const code = lastSmsCode(phone, since) as string;
    const wrong = code === '000000' ? '111111' : '000000';

    const ctx = await browser.newContext({
      viewport: { width: 360, height: 740 },
      isMobile: true,
      hasTouch: true,
      locale: 'fr-FR',
      timezoneId: 'Africa/Lome',
    });
    const page = await ctx.newPage();
    await signIn(page, 'courier');
    await page.goto('/livreur');
    await expect(page.getByRole('heading', { name: 'Mes courses' })).toBeVisible();

    const card = page.getByRole('listitem', { name: `Course ${number}` });
    await expect(card).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'pas de défilement horizontal à 360 px').toBeLessThanOrEqual(0);

    const start = card.getByRole('button', { name: 'Démarrer la course' });
    if (await start.isVisible()) await start.click();

    await card.getByLabel('Code de remise du client').fill(wrong);
    await card.getByRole('button', { name: 'Valider la remise' }).click();
    await expect(card.getByRole('alert')).toBeVisible();
    expect(await orderStatus(orderId)).toBe('shipped');

    await card.getByLabel('Code de remise du client').fill(code);
    await card.getByRole('button', { name: 'Valider la remise' }).click();
    await expect(page.getByText('Livraison validée.')).toBeVisible();
    await expect.poll(() => orderStatus(orderId)).toBe('delivered');
    await ctx.close();
  });
});
