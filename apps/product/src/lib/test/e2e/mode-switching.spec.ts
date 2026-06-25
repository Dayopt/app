import { expect, test } from '@playwright/test';

/**
 * Mode Switching E2E
 *
 * Phase 2-B Step 2-3 regression guard:
 * Link-based navigation between Calendar and Stats preserves URL state
 * and supports browser back without ClientPageRouter.
 * SidebarPageNav (Desktop) と BottomTabBar (Mobile) の両経路で同じセレクタを使う。
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

test.describe('Mode Switching: Calendar ↔ Stats ↔ AI', () => {
  test.skip(SKIP_AUTH_TESTS, 'TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定');

  test('navigates between calendar and stats and supports browser back', async ({ page }) => {
    await loginAndNavigate(page);

    // 起点: Calendar day view
    await page.goto('/ja/day?date=2026-04-20');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/ja\/day/);

    // Stats へ遷移 (Sidebar / BottomTabBar どちらの "統計" リンクでも最初の 1 つをクリック)
    const statsLink = page.getByRole('link', { name: /統計|Stats/i }).first();
    await statsLink.click();
    await expect(page).toHaveURL(/\/ja\/stats\/review/);

    // Calendar に戻る
    const calendarLink = page.getByRole('link', { name: /カレンダー|Calendar/i }).first();
    await calendarLink.click();
    await expect(page).toHaveURL(/\/ja\/day/);

    // ブラウザバックで Stats に戻る
    await page.goBack();
    await expect(page).toHaveURL(/\/ja\/stats\/review/);

    // ブラウザバックで Calendar に戻る
    await page.goBack();
    await expect(page).toHaveURL(/\/ja\/day/);
  });

  test('navigates through 3 modes (calendar → stats → ai → calendar) with browser back', async ({
    page,
  }) => {
    await loginAndNavigate(page);

    // 起点: Calendar day view
    await page.goto('/ja/day?date=2026-04-20');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/ja\/day/);

    // Stats へ
    await page
      .getByRole('link', { name: /統計|Stats/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/ja\/stats\/review/);

    // AI へ (Phase 2-C Step C-3 で新設、C-4/C-5 で UI 経路追加)
    await page.getByRole('link', { name: /^AI$/i }).first().click();
    await expect(page).toHaveURL(/\/ja\/ai/);

    // Calendar に戻る
    await page
      .getByRole('link', { name: /カレンダー|Calendar/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/ja\/day/);

    // ブラウザバックで AI → Stats → Calendar
    await page.goBack();
    await expect(page).toHaveURL(/\/ja\/ai/);

    await page.goBack();
    await expect(page).toHaveURL(/\/ja\/stats\/review/);

    await page.goBack();
    await expect(page).toHaveURL(/\/ja\/day/);
  });
});
