import { expect, test } from '@playwright/test';

/**
 * Sidebar Persistence E2E
 *
 * Phase 2-B Step 2 regression guard:
 * SidebarPageNav の動的 href (useMemo + buildCalendarPath) が Calendar の
 * viewType を保持し、Stats 経由で戻っても day にリセットされないことを検証。
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

  await page.waitForURL(/\/(calendar|stats)/i, { timeout: 15000 });
}

test.describe('Sidebar Persistence: Dynamic href preserves viewType', () => {
  test.skip(SKIP_AUTH_TESTS, 'TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定');

  test('calendar week view survives round trip via stats', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('Mobile'), 'desktop-only');

    await loginAndNavigate(page);

    // week view で Calendar 起動
    await page.goto('/ja/calendar/week?date=2026-04-20');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/ja\/calendar\/week/);

    // Stats へ遷移 (SidebarPageNav)
    const statsLink = page.getByRole('link', { name: /統計|Stats/i }).first();
    await statsLink.click();
    await expect(page).toHaveURL(/\/ja\/stats\/review/);

    // Calendar に戻る (動的 href で week が保持されるはず)
    const calendarLink = page.getByRole('link', { name: /カレンダー|Calendar/i }).first();
    await calendarLink.click();

    // week viewType が保持 (day にリセットされない)
    await expect(page).toHaveURL(/\/ja\/calendar\/week/);
  });
});
