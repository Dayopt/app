import { expect, test } from '@playwright/test';

/**
 * 認証フロー E2E テスト
 *
 * E2E の責務は「ページが route として配信され、認証の配線が通ること」に限定する。
 * フォーム部品の描画・入力・トグル・バリデーションは component test が正:
 * - features/auth/components/__tests__/LoginForm.test.tsx
 * - features/auth/components/__tests__/SignupForm.test.tsx
 * - features/auth/components/__tests__/PasswordResetForm.test.tsx
 * 未認証リダイレクトとログイン導線の重複は smoke.spec.ts が正。
 *
 * @see Storybook → Features/Auth/* でUI詳細を確認
 */

const SKIP_AUTH_TESTS = !process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD;

// ─────────────────────────────────────────────────────────
// ページ配信（未認証で実行可能、CI で常時走る層）
// ─────────────────────────────────────────────────────────

test.describe('Auth: ページ配信', () => {
  test('サインアップページがフォームと規約・ログイン導線を配信する', async ({ page }) => {
    await page.goto('/auth/signup');

    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    await expect(
      page.locator('[role="checkbox"], a[href*="terms"], [data-testid="terms"]').first(),
    ).toBeVisible();
    await expect(page.locator('a[href*="login"]').first()).toBeVisible();
  });

  test('ログインページがフォームとリセット・サインアップ導線を配信する', async ({ page }) => {
    await page.goto('/auth/login');

    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    await expect(
      page.locator('a[href*="password"], a[href*="reset"], a[href*="forgot"]').first(),
    ).toBeVisible();
    await expect(page.locator('a[href*="signup"]').first()).toBeVisible();
  });

  test('パスワードリセットページがフォームと戻る導線を配信する', async ({ page }) => {
    await page.goto('/auth/password');

    await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    await expect(page.locator('a[href*="login"]').first()).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────
// 実 Supabase を通す認証フロー（TEST_USER が必要、ローカル実行）
// ─────────────────────────────────────────────────────────

test.describe('Auth: 認証フロー', () => {
  test.skip(SKIP_AUTH_TESTS, 'TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定');

  test('正しい認証情報でログインしカレンダーへ遷移する', async ({ page }) => {
    await page.goto('/auth/login');

    await page
      .locator('input[type="email"], input[name="email"]')
      .first()
      .fill(process.env.TEST_USER_EMAIL!);
    await page.locator('input[type="password"]').first().fill(process.env.TEST_USER_PASSWORD!);
    await page.locator('button[type="submit"]').first().click();

    await page.waitForURL(/\/(day|week|stats)/i, { timeout: 15000 });
    await expect(page).toHaveTitle(/Dayopt/);
  });

  test('誤った認証情報でエラー表示', async ({ page }) => {
    await page.goto('/auth/login');

    await page
      .locator('input[type="email"], input[name="email"]')
      .first()
      .fill('wrong@example.com');
    await page.locator('input[type="password"]').first().fill('WrongPassword123');
    await page.locator('button[type="submit"]').first().click();

    // エラーメッセージが表示される（ユーザー列挙を防ぐ汎用メッセージ）
    await expect(
      page.locator('[role="alert"], [data-field-error], .text-destructive').first(),
    ).toBeVisible({ timeout: 10000 });
  });
});
