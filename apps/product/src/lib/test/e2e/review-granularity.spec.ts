import { expect, test } from '@playwright/test';

/**
 * Calendar Review Panel E2E
 *
 * Review は独立ページではなく Calendar の contextual panel として復元される。
 */

const SKIP_AUTH_TESTS = !process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD;

async function login(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  const submitButton = page.locator('button[type="submit"]').first();

  await emailInput.fill(process.env.TEST_USER_EMAIL!);
  await passwordInput.fill(process.env.TEST_USER_PASSWORD!);
  await submitButton.click();

  await page.waitForURL(/\/(day|week|review)/i, { timeout: 15000 });
}

test.describe('Smoke: Calendar Review Panel', () => {
  test.skip(SKIP_AUTH_TESTS, 'TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定');

  test('panel=review deep link restores the review panel', async ({ page }) => {
    await login(page);

    await page.goto('/ja/calendar/week?date=2026-04-20&panel=review');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/ja\/calendar\/week\?date=2026-04-20&panel=review/);
    await expect(page.getByRole('heading', { name: /振り返り|Review/i }).first()).toBeVisible({
      timeout: 15000,
    });
  });
});
