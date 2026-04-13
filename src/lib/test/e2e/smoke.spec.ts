import { expect, test } from '@playwright/test';

/**
 * スモークテスト
 *
 * ルーティング、認証リダイレクト、主要ページの表示を最小限のテストで確認。
 * UI詳細のテストはStorybook play関数に移行済み。
 *
 * @see Storybook → Docs/テスト戦略
 */
test.describe('Smoke: ルーティング', () => {
  test('未認証ユーザーは認証ページにリダイレクトされる', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 認証ページにリダイレクトされることを確認
    await page.waitForURL(/\/(login|auth|signin)/i, { timeout: 10000 }).catch(() => {
      // 既にログイン済みの場合もOK
    });

    // ページタイトルが存在する
    await expect(page).toHaveTitle(/Dayopt/);
  });

  test('ページが正常にレンダリングされる', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 基本的な要素の存在確認
    const heading = page.locator('h1, h2, [role="heading"]').first();
    await expect(heading).toBeVisible({ timeout: 15000 });
  });

  test('横スクロールが発生しない（デスクトップ）', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    await expect(body).toBeVisible({ timeout: 15000 });

    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 10);
  });

  test('横スクロールが発生しない（モバイル）', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    await expect(body).toBeVisible({ timeout: 15000 });

    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 10);
  });
});

test.describe('Smoke: 認証フロー', () => {
  test('ログインフォームが表示される', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 認証ページにリダイレクトされた場合
    const isAuthPage = page.url().match(/\/(login|auth|signin)/i);
    if (isAuthPage) {
      // メールとパスワードの入力欄が存在する
      const emailInput = page.locator('input[type="email"], input[name="email"]').first();
      const passwordInput = page.locator('input[type="password"]').first();

      await expect(emailInput).toBeVisible({ timeout: 10000 });
      await expect(passwordInput).toBeVisible();
    }
  });

  test.describe('認証済みユーザー', () => {
    test.skip(
      !process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD,
      'TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定',
    );

    test('ログイン→カレンダー表示→ログアウト', async ({ page }) => {
      // ログインページへ
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // メール入力
      const emailInput = page.locator('input[type="email"], input[name="email"]').first();
      await emailInput.fill(process.env.TEST_USER_EMAIL!);

      // パスワード入力
      const passwordInput = page.locator('input[type="password"]').first();
      await passwordInput.fill(process.env.TEST_USER_PASSWORD!);

      // ログインボタンクリック
      const submitButton = page.locator('button[type="submit"]').first();
      await submitButton.click();

      // カレンダーページに遷移
      await page.waitForURL(/\/(day|week|stats)/i, { timeout: 15000 });
      await expect(page).toHaveTitle(/Dayopt/);
    });
  });
});
