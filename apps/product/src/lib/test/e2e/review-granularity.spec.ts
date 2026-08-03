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

  test('panel=review deep link restores the review panel', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('Mobile'), 'desktop-only（mobile は sheet 表示）');
    await login(page);

    // review panel を持つ route は /ja/week（/ja/calendar/week は存在しない）
    await page.goto('/ja/week?date=2026-04-20&panel=review');

    await expect(page).toHaveURL(/\/ja\/week\?date=2026-04-20&panel=review/);
    // desktop の Review panel は heading ではなく region（aria-label="振り返り"）
    await expect(page.getByRole('region', { name: /振り返り|Review/i }).first()).toBeVisible({
      timeout: 15000,
    });
  });
});
