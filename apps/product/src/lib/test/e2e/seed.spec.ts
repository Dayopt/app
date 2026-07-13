import { expect, test } from '@playwright/test';

const HAS_TEST_USER = Boolean(process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD);

test.describe('Playwright Test Agent seed', () => {
  test('authenticated Calendar session', async ({ page }) => {
    test.skip(!HAS_TEST_USER, 'TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定');

    await page.goto('/ja/auth/login');
    await page.locator('input[name="email"]').fill(process.env.TEST_USER_EMAIL!);
    await page.locator('input[name="password"]').fill(process.env.TEST_USER_PASSWORD!);
    await page.locator('button[type="submit"]').click();

    await page.waitForURL(/\/ja\/(day|week)/, { timeout: 15_000 });
    await expect(page.locator('[data-calendar-grid][data-calendar-day-index="0"]')).toBeVisible({
      timeout: 10_000,
    });
  });
});
