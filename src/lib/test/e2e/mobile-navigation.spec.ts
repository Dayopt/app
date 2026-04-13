import { expect, test } from '@playwright/test';

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

test.describe('Mobile Navigation', () => {
  test.skip(SKIP_AUTH_TESTS, 'TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定');

  test('settings route stays on mobile account page', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('Mobile'), 'mobile-only');

    await loginAndNavigate(page);
    await page.goto('/ja/settings');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/ja\/settings$/);
    await expect(page.getByRole('button', { name: 'アカウント' })).toHaveAttribute(
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

    const calendarButton = page.getByRole('button', { name: 'カレンダー' });
    const statsButton = page.getByRole('button', { name: '統計' });
    const accountButton = page.getByRole('button', { name: 'アカウント' });

    await expect(calendarButton).toHaveAttribute('aria-current', 'page');

    await statsButton.click();
    await expect(page).toHaveURL(/\/ja\/stats\/review$/);
    await expect(statsButton).toHaveAttribute('aria-current', 'page');

    await calendarButton.click();
    await expect(page).toHaveURL(/\/ja\/calendar\/day\?date=2026-03-25$/);
    await expect(calendarButton).toHaveAttribute('aria-current', 'page');

    await accountButton.click();
    await expect(page).toHaveURL(/\/ja\/settings$/);
    await expect(accountButton).toHaveAttribute('aria-current', 'page');
  });
});
