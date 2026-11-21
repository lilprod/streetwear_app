import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, DEMO_TOTP_SECRET, demoEmail } from './support/env';
import { authBudget, signIn } from './support/helpers';
import { totp } from './support/totp';

test.describe('Parcours A : connexion avec double authentification', () => {
  test('mauvais mot de passe puis mauvais code refusés, bon code accepté', async ({ page }) => {
    await authBudget(4);
    await page.goto('/commandes');
    await expect(page).toHaveURL(/\/connexion/);

    await page.getByLabel('Adresse e-mail').fill(demoEmail('super-admin'));
    await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();

    await page.getByLabel('Mot de passe').fill(DEMO_PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('heading', { name: 'Vérification en deux étapes' })).toBeVisible();

    const wrong = totp(DEMO_TOTP_SECRET) === '000000' ? '111111' : '000000';
    await page.getByLabel('Code à 6 chiffres').fill(wrong);
    await page.getByRole('button', { name: 'Valider' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0);

    await page.getByLabel('Code à 6 chiffres').fill(totp(DEMO_TOTP_SECRET));
    await page.getByRole('button', { name: 'Valider' }).click();
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
  });

  test('chaque rôle ne voit que ses modules', async ({ page }) => {
    await signIn(page, 'production');
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    await expect(nav.getByRole('link', { name: 'Production' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Équipe et réglages' })).toHaveCount(0);
    await page.goto('/equipe');
    await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Équipe et réglages' })).toHaveCount(0);
  });
});
