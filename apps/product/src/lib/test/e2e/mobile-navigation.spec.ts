import { expect, test } from '@playwright/test';

/**
 * Mobile Navigation E2E
 *
 * Phase 2-B Step 3 regression guard:
 * BottomTabBar が next/link ベースに移行したため、button ロケータから
 * link ロケータへの置換と href 属性ベース確認を追加。
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

  await page.waitForURL(/\/calendar/i, { timeout: 15000 });
}

test.describe('Mobile Navigation', () => {
  test.skip(SKIP_AUTH_TESTS, 'TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定');

  test('settings route stays on mobile account page', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('Mobile'), 'mobile-only');

    await loginAndNavigate(page);
    await page.goto('/ja/settings');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/ja\/settings$/);
    await expect(page.getByRole('link', { name: 'アカウント' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('button', { name: 'ログアウト' })).toBeVisible();
  });

  test('bottom tabs preserve current date when returning to calendar', async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.includes('Mobile'), 'mobile-only');

    await loginAndNavigate(page);
    await page.goto('/ja/calendar/day?date=2026-03-25');
    await page.waitForLoadState('networkidle');

    const calendarLink = page.getByRole('link', { name: 'カレンダー' });
    const accountLink = page.getByRole('link', { name: 'アカウント' });

    // href 属性が動的に正しい URL を生成していることを確認 (Phase 2-B 動的 href)
    await expect(calendarLink).toHaveAttribute('href', /\/ja\/calendar\/day\?date=2026-03-25/);
    await expect(accountLink).toHaveAttribute('href', '/ja/settings');
    await expect(page.getByRole('link', { name: '統計' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'AI' })).toHaveCount(0);

    await expect(calendarLink).toHaveAttribute('aria-current', 'page');

    await accountLink.click();
    await expect(page).toHaveURL(/\/ja\/settings$/);
    await expect(accountLink).toHaveAttribute('aria-current', 'page');

    await calendarLink.click();
    await expect(page).toHaveURL(/\/ja\/calendar\/day\?date=2026-03-25$/);
    await expect(calendarLink).toHaveAttribute('aria-current', 'page');
  });
});
