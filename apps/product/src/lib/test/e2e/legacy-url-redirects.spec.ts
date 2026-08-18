import { expect, test } from '@playwright/test';

/**
 * Legacy URL Redirect E2E
 *
 * workspace-shell-restructure（#2181）Step 2: 旧 URL（/day, /week, /Nday、
 * `?panel=` 付き含む）から `/calendar` `/report` への写像を実ブラウザで検証する
 * （docs/projects/workspace-shell-restructure/overview.md §4-4）。
 *
 * `proxy.test.ts`（unit）が同じ写像ロジックを網羅済みだが、ここでは実際の
 * ブラウザナビゲーションとして「旧 URL の deep link が壊れていない」ことを固定する。
 */

const SKIP_AUTH_TESTS = !process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD;

async function login(page: import('@playwright/test').Page) {
  await page.goto('/ja/auth/login');
  await page.waitForLoadState('networkidle');

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  const submitButton = page.locator('button[type="submit"]').first();

  await emailInput.fill(process.env.TEST_USER_EMAIL!);
  await passwordInput.fill(process.env.TEST_USER_PASSWORD!);
  await submitButton.click();

  await page.waitForURL(/\/ja\/calendar/i, { timeout: 15000 });
}

test.describe('Legacy URL redirects', () => {
  test.skip(SKIP_AUTH_TESTS, 'TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定');

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const legacyToCalendar: Array<[string, string]> = [
    ['/ja/day?date=2026-04-20', '/ja/calendar?date=2026-04-20&view=day'],
    ['/ja/week?date=2026-04-20', '/ja/calendar?date=2026-04-20&view=week'],
    ['/ja/2day?date=2026-04-20', '/ja/calendar?date=2026-04-20&view=2day'],
    ['/ja/7day?date=2026-04-20', '/ja/calendar?date=2026-04-20&view=7day'],
  ];

  for (const [from, to] of legacyToCalendar) {
    test(`${from} redirects to ${to}`, async ({ page }) => {
      await page.goto(from);
      await expect(page).toHaveURL(new RegExp(to.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    });
  }

  test('panel=review redirects to /report with range derived from view', async ({ page }) => {
    await page.goto('/ja/week?date=2026-04-20&panel=review&reviewTagId=some-tag');
    await expect(page).toHaveURL(/\/ja\/report\?date=2026-04-20&range=week/);
    // reviewTagId は落ちる（§4-4）
    await expect(page).not.toHaveURL(/reviewTagId/);
  });

  test('panel=diff on day view redirects to /report with range=day', async ({ page }) => {
    await page.goto('/ja/day?date=2026-04-20&panel=diff');
    await expect(page).toHaveURL(/\/ja\/report\?date=2026-04-20&range=day/);
  });
});
