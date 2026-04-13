import { expect, test } from '@playwright/test';

/**
 * クリティカルパステスト
 *
 * ビジネスクリティカルなユーザーフローの疎通確認。
 * 各機能のUI操作詳細はStorybook play関数でカバー。
 * サーバーサイドのCRUDロジックはintegration testでカバー。
 *
 * @see Storybook → Docs/テスト戦略
 */

// 認証が必要なテストはスキップ条件を設定
const SKIP_AUTH_TESTS = !process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD;

/**
 * 共通ログインヘルパー
 */
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

test.describe('Critical Path: カレンダー & エントリ管理', () => {
  test.skip(SKIP_AUTH_TESTS, 'TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定');

  test.beforeEach(async ({ page }) => {
    await loginAndNavigate(page);
  });

  test('カレンダーページが正常に表示される', async ({ page }) => {
    // ナビゲーション要素が存在する
    const nav = page.locator('nav, [role="navigation"]').first();
    await expect(nav).toBeVisible({ timeout: 10000 });

    // カレンダーのグリッドまたはタイムスロットが表示される
    const calendarContent = page
      .locator('[data-testid="calendar"], [role="grid"], .calendar-view')
      .first();
    await expect(calendarContent).toBeVisible({ timeout: 10000 });
  });

  test('エントリ作成導線が存在する', async ({ page }) => {
    // 作成ボタンまたはFABが存在する
    const createButton = page
      .locator(
        'button:has-text("作成"), button:has-text("New"), button[aria-label*="作成"], button[aria-label*="create"], button[aria-label*="new"]',
      )
      .first();

    await expect(createButton).toBeVisible({ timeout: 10000 });
  });

  test('カレンダービューにエントリ領域が表示される', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    // タイムスロットまたはエントリのコンテナが存在する
    const timeSlots = page
      .locator('[data-testid="time-slots"], [data-testid="calendar"], [role="grid"], .time-column')
      .first();
    await expect(timeSlots).toBeVisible({ timeout: 10000 });
  });
});
