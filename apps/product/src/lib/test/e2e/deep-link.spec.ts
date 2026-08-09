import { expect, test } from '@playwright/test';

/**
 * Deep Link E2E
 *
 * Phase 2-B Step 4 regression guard:
 * ClientPageRouter 撤去後、基本ルートへの deep link が SSR で正常描画され
 * Sidebar が初回レンダリングから表示されることを検証。
 *
 * Review は独立ページではなく Calendar panel として deep link する。
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

  test('calendar review panel renders with sidebar on direct access', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name.includes('Mobile'), 'desktop-only');

    await loginAndNavigate(page);

    // 直接 Calendar review panel に遷移（/ja/calendar/week という route は存在しない）
    await page.goto('/ja/week?date=2026-04-20&panel=review');
    await expect(page).toHaveURL(/\/ja\/week\?date=2026-04-20&panel=review/);

    // Sidebar が初回レンダリングから表示されている（現 shell は <aside> = complementary landmark）
    const sidebar = page.getByRole('complementary').first();
    await expect(sidebar).toBeVisible();

    // desktop の Review panel は heading ではなく region（aria-label="振り返り"）
    await expect(page.getByRole('region', { name: /振り返り|Review/i }).first()).toBeVisible();
  });

  test('calendar week renders with sidebar on direct access', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('Mobile'), 'desktop-only');

    await loginAndNavigate(page);

    // 直接 /week に遷移
    await page.goto('/ja/week?date=2026-04-20');
    await expect(page).toHaveURL(/\/ja\/week/);

    // Sidebar が初回レンダリングから表示されている（現 shell は <aside> = complementary landmark）
    const sidebar = page.getByRole('complementary').first();
    await expect(sidebar).toBeVisible();

    // Calendar グリッドが deep link 直後から描画される
    await expect(page.locator('[data-calendar-grid]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('prefixless default-locale calendar renders only its own visible header', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name.includes('Mobile'), 'desktop-only');

    await loginAndNavigate(page);

    await page.goto('/day?date=2026-04-20');
    await expect(page).toHaveURL(/\/day\?date=2026-04-20/);
    await expect(page.locator('[data-calendar-grid]').first()).toBeVisible({ timeout: 10_000 });

    // CalendarLayout は responsive header を2つDOMに持つため、実際に表示中のheaderを数える。
    // shell側のlocale誤判定が再発すると、desktopでvisible headerが2つになる。
    await expect(page.locator('header:visible')).toHaveCount(1);
  });
});
