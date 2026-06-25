import { expect, test } from '@playwright/test';

/**
 * Mobile Navigation E2E
 *
 * Calendar 1画面化後の mobile shell regression guard:
 * フッターはタグ作成専用にし、アカウント導線は右上 icon から設定へ遷移する。
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

  await page.waitForURL(/\/(day|week|stats)/i, { timeout: 15000 });
}

test.describe('Mobile Navigation', () => {
  test.skip(SKIP_AUTH_TESTS, 'TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定');

  test('settings route stays on mobile account page', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('Mobile'), 'mobile-only');

    await loginAndNavigate(page);
    await page.goto('/ja/settings');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/ja\/settings$/);
    await expect(page.getByRole('button', { name: 'ログアウト' })).toBeVisible();
  });

  test('account icon opens settings without rendering bottom tabs', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('Mobile'), 'mobile-only');

    await loginAndNavigate(page);
    await page.goto('/ja/day?date=2026-03-25');
    await page.waitForLoadState('networkidle');

    const accountLink = page.getByRole('link', { name: 'アカウント' });

    // href 属性が動的に正しい URL を生成していることを確認 (Phase 2-B 動的 href)
    await expect(calendarLink).toHaveAttribute('href', /\/ja\/day\?date=2026-03-25/);
    await expect(statsLink).toHaveAttribute('href', /\/ja\/stats\/review/);
    await expect(aiLink).toHaveAttribute('href', '/ja/ai');
    await expect(accountLink).toHaveAttribute('href', '/ja/settings');

    await expect(calendarLink).toHaveAttribute('aria-current', 'page');

    await statsLink.click();
    await expect(page).toHaveURL(/\/ja\/stats\/review$/);
    await expect(statsLink).toHaveAttribute('aria-current', 'page');

    // AI タブ遷移 (Phase 2-C Step C-4 で追加)
    await aiLink.click();
    await expect(page).toHaveURL(/\/ja\/ai$/);
    await expect(aiLink).toHaveAttribute('aria-current', 'page');

    await calendarLink.click();
    await expect(page).toHaveURL(/\/ja\/day\?date=2026-03-25$/);
    await expect(calendarLink).toHaveAttribute('aria-current', 'page');

    await accountLink.click();
    await expect(page).toHaveURL(/\/ja\/settings$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/ja\/calendar\/day\?date=2026-03-25$/);
  });
});
