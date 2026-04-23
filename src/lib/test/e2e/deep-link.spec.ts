import { expect, test } from '@playwright/test';

/**
 * Deep Link E2E
 *
 * Phase 2-B Step 4 regression guard:
 * ClientPageRouter 撤去後、基本ルートへの deep link が SSR で正常描画され
 * Sidebar が初回レンダリングから表示されることを検証。
 *
 * /stats/tags/[tagId] の tagId 動的取得は Phase 2-C 以降の tag feature E2E で対応。
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

test.describe('Deep Link: SSR rendering of app routes', () => {
  test.skip(SKIP_AUTH_TESTS, 'TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定');

  test('stats review renders with sidebar on direct access', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('Mobile'), 'desktop-only');

    await loginAndNavigate(page);

    // 直接 /stats/review に遷移
    await page.goto('/ja/stats/review');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/ja\/stats\/review/);

    // Sidebar が SSR から表示されている
    const sidebar = page.locator('[role="navigation"]').first();
    await expect(sidebar).toBeVisible();

    // Stats link が aria-current="page"
    const statsLink = page.getByRole('link', { name: /統計|Stats/i }).first();
    await expect(statsLink).toHaveAttribute('aria-current', 'page');
  });

  test('calendar week renders with sidebar on direct access', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('Mobile'), 'desktop-only');

    await loginAndNavigate(page);

    // 直接 /calendar/week に遷移
    await page.goto('/ja/calendar/week?date=2026-04-20');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/ja\/calendar\/week/);

    // Sidebar が SSR から表示
    const sidebar = page.locator('[role="navigation"]').first();
    await expect(sidebar).toBeVisible();

    // Calendar link が aria-current="page"
    const calendarLink = page.getByRole('link', { name: /カレンダー|Calendar/i }).first();
    await expect(calendarLink).toHaveAttribute('aria-current', 'page');
  });

  test('ai mode renders with sidebar on direct access', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('Mobile'), 'desktop-only');

    await loginAndNavigate(page);

    // 直接 /ja/ai に遷移 (Phase 2-C Step C-3 で新設)
    await page.goto('/ja/ai');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/ja\/ai/);

    // Sidebar が SSR から表示 (AiSidebar が pathname dispatch で描画)
    const sidebar = page.locator('[role="navigation"]').first();
    await expect(sidebar).toBeVisible();

    // AI link (PageNav) が aria-current="page"
    const aiLink = page.getByRole('link', { name: /^AI$/i }).first();
    await expect(aiLink).toHaveAttribute('aria-current', 'page');
  });

  test('ai thread detail stub renders on direct access', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('Mobile'), 'desktop-only');

    await loginAndNavigate(page);

    // 直接 /ja/ai/threads/{任意 ID} に遷移 (Phase 2-C Step C-3 stub)
    // threadId 任意文字列を受け入れ、404 にならない
    await page.goto('/ja/ai/threads/test123');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/ja\/ai\/threads\/test123/);

    // Sidebar は AiSidebar のまま維持 (pathname prefix 判定で 'ai' mode)
    const sidebar = page.locator('[role="navigation"]').first();
    await expect(sidebar).toBeVisible();

    // AI link が aria-current="page" (/ai/threads/* も AI mode として判定)
    const aiLink = page.getByRole('link', { name: /^AI$/i }).first();
    await expect(aiLink).toHaveAttribute('aria-current', 'page');
  });
});
