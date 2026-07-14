import { expect, test } from '@playwright/test';

test('footer の言語切替で locale prefix と hero copy が切り替わる', async ({ page }) => {
  await page.goto('/');

  const hero = page.getByRole('heading', { level: 1 });
  await expect(hero).toContainText('Own');
  await expect(hero).toContainText('time.');

  await page.getByRole('button', { name: 'English - Change language' }).click();
  await page.getByRole('menuitemcheckbox', { name: '日本語' }).click();

  await expect(page).toHaveURL(/\/ja\/?$/);
  await expect(hero).toContainText('時間を、');
  await expect(hero).toContainText('ものに。');

  await page.getByRole('button', { name: '日本語 - Change language' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'English' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page).not.toHaveURL(/\/ja\/?$/);
  await expect(hero).toContainText('Own');
  await expect(hero).toContainText('time.');
});
