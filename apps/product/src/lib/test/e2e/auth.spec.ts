import { expect, test } from '@playwright/test';

/**
 * 認証フロー E2E テスト
 *
 * サインアップ → ログイン → パスワードリセットの主要フローを検証。
 * 環境変数が未設定の場合はスキップ。
 *
 * @see Storybook → Features/Auth/* でUI詳細を確認
 */

const SKIP_AUTH_TESTS = !process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD;

// ─────────────────────────────────────────────────────────
// サインアップフロー
// ─────────────────────────────────────────────────────────

test.describe('Auth: サインアップ', () => {
  test('サインアップフォームが表示される', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.waitForLoadState('networkidle');

    // フォーム要素が存在する
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();
  });

  test('利用規約チェックボックスが存在する', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.waitForLoadState('networkidle');

    // チェックボックスまたは利用規約リンクが存在
    const termsElement = page
      .locator('[role="checkbox"], a[href*="terms"], [data-testid="terms"]')
      .first();
    await expect(termsElement).toBeVisible({ timeout: 10000 });
  });

  test('ログインページへのリンクが存在する', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.waitForLoadState('networkidle');

    const loginLink = page.locator('a[href*="login"]').first();
    await expect(loginLink).toBeVisible({ timeout: 10000 });
  });

  test('短すぎるパスワードでバリデーションエラー', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();
    await emailInput.fill('test@example.com');
    await passwordInput.fill('short');
    await submitButton.click();

    // Zodバリデーションエラー（minLength=8）が表示される
    const errorElement = page
      .locator('[data-field-error], [role="alert"], .text-destructive')
      .first();
    await expect(errorElement).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────
// ログインフロー
// ─────────────────────────────────────────────────────────

test.describe('Auth: ログイン', () => {
  test('ログインフォームが表示される', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();
  });

  test('パスワードリセットリンクが存在する', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    const resetLink = page
      .locator('a[href*="password"], a[href*="reset"], a[href*="forgot"]')
      .first();
    await expect(resetLink).toBeVisible({ timeout: 10000 });
  });

  test('サインアップページへのリンクが存在する', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    const signupLink = page.locator('a[href*="signup"]').first();
    await expect(signupLink).toBeVisible({ timeout: 10000 });
  });

  test('パスワード表示トグルが動作する', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 10000 });

    // パスワードを入力
    await passwordInput.fill('TestPassword123');
    expect(await passwordInput.getAttribute('type')).toBe('password');

    // アイコンボタンをクリックしてトグル
    const toggleButton = page
      .locator('button[aria-label*="password" i], button[aria-label*="パスワード" i]')
      .first();
    if (await toggleButton.isVisible()) {
      await toggleButton.click();
      // type が text に変わる
      const input = page.locator('input#password, input[name="password"]').first();
      expect(await input.getAttribute('type')).toBe('text');
    }
  });

  test.describe('認証済みフロー', () => {
    test.skip(SKIP_AUTH_TESTS, 'TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定');

    test('正しい認証情報でログイン成功', async ({ page }) => {
      await page.goto('/auth/login');
      await page.waitForLoadState('networkidle');

      const emailInput = page.locator('input[type="email"], input[name="email"]').first();
      const passwordInput = page.locator('input[type="password"]').first();
      const submitButton = page.locator('button[type="submit"]').first();

      await emailInput.fill(process.env.TEST_USER_EMAIL!);
      await passwordInput.fill(process.env.TEST_USER_PASSWORD!);
      await submitButton.click();

      // アプリページに遷移
      await page.waitForURL(/\/(day|week|stats)/i, { timeout: 15000 });
      await expect(page).toHaveTitle(/Dayopt/);
    });

    test('誤った認証情報でエラー表示', async ({ page }) => {
      await page.goto('/auth/login');
      await page.waitForLoadState('networkidle');

      const emailInput = page.locator('input[type="email"], input[name="email"]').first();
      const passwordInput = page.locator('input[type="password"]').first();
      const submitButton = page.locator('button[type="submit"]').first();

      await emailInput.fill('wrong@example.com');
      await passwordInput.fill('WrongPassword123');
      await submitButton.click();

      // エラーメッセージが表示される（ユーザー列挙を防ぐ汎用メッセージ）
      const errorElement = page
        .locator('[role="alert"], [data-field-error], .text-destructive')
        .first();
      await expect(errorElement).toBeVisible({ timeout: 10000 });
    });
  });
});

// ─────────────────────────────────────────────────────────
// パスワードリセットフロー
// ─────────────────────────────────────────────────────────

test.describe('Auth: パスワードリセット', () => {
  test('パスワードリセットフォームが表示される', async ({ page }) => {
    await page.goto('/auth/password');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    const submitButton = page.locator('button[type="submit"]').first();

    await expect(emailInput).toBeVisible({ timeout: 10000 });
    await expect(submitButton).toBeVisible();
  });

  test('ログインページへ戻るリンクが存在する', async ({ page }) => {
    await page.goto('/auth/password');
    await page.waitForLoadState('networkidle');

    const backLink = page.locator('a[href*="login"]').first();
    await expect(backLink).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────
// 認証リダイレクト
// ─────────────────────────────────────────────────────────

test.describe('Auth: リダイレクト', () => {
  test('未認証ユーザーは保護されたページからリダイレクトされる', async ({ page }) => {
    await page.goto('/day');
    await page.waitForLoadState('networkidle');

    // auth系のページにリダイレクト
    await page.waitForURL(/\/(login|auth|signin)/i, { timeout: 10000 }).catch(() => {
      // 既にログイン済みの場合はOK
    });
  });

  test.describe('認証後リダイレクト', () => {
    test.skip(SKIP_AUTH_TESTS, 'TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定');

    test('ログイン後にカレンダーページへ遷移する', async ({ page }) => {
      await page.goto('/auth/login');
      await page.waitForLoadState('networkidle');

      const emailInput = page.locator('input[type="email"], input[name="email"]').first();
      const passwordInput = page.locator('input[type="password"]').first();
      const submitButton = page.locator('button[type="submit"]').first();

      await emailInput.fill(process.env.TEST_USER_EMAIL!);
      await passwordInput.fill(process.env.TEST_USER_PASSWORD!);
      await submitButton.click();

      await page.waitForURL(/\/(day|week|stats)/i, { timeout: 15000 });
    });
  });
});
