import { expect, test } from '@playwright/test';

/**
 * Deep Link E2E
 *
 * Phase 2-B Step 4 regression guard:
 * ClientPageRouter 撤去後、基本ルートへの deep link が SSR で正常描画され
 * Sidebar が初回レンダリングから表示されることを検証。
 *
 * /review/tags/[tagId] の tagId 動的取得は tag feature E2E で対応。
 */

const SKIP_AUTH_TESTS = !process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD;

async function loginAndNavigate(page: import('@playwright/test').Page) {
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

test.describe('Deep Link: SSR rendering of app routes', () => {
  test.skip(SKIP_AUTH_TESTS, 'TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定');

  test('review renders with sidebar on direct access', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('Mobile'), 'desktop-only');

    await loginAndNavigate(page);

    // 直接 /review に遷移
    await page.goto('/ja/review');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/ja\/review/);

    // Sidebar が SSR から表示されている
    const sidebar = page.locator('[role="navigation"]').first();
    await expect(sidebar).toBeVisible();

    // Review link が aria-current="page"
    const reviewLink = page.getByRole('link', { name: /振り返り|Review/i }).first();
    await expect(reviewLink).toHaveAttribute('aria-current', 'page');
  });

  test('calendar week renders with sidebar on direct access', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('Mobile'), 'desktop-only');

    await loginAndNavigate(page);

    // 直接 /week に遷移
    await page.goto('/ja/week?date=2026-04-20');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/ja\/week/);

    // Sidebar が SSR から表示
    const sidebar = page.locator('[role="navigation"]').first();
    await expect(sidebar).toBeVisible();

    // Calendar link が aria-current="page"
    const calendarLink = page.getByRole('link', { name: /カレンダー|Calendar/i }).first();
    await expect(calendarLink).toHaveAttribute('aria-current', 'page');
  });
});
