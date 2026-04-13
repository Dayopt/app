import { test as setup } from '@playwright/test';

/**
 * E2Eテスト用認証セットアップ
 *
 * このファイルは、Playwrightテスト実行前に一度だけ実行され、
 * ログイン状態を playwright/.auth/user.json に保存します。
 *
 * 環境変数:
 * - TEST_USER_EMAIL: テスト用ユーザーのメールアドレス
 * - TEST_USER_PASSWORD: テスト用ユーザーのパスワード
 */

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  // 環境変数からテスト用認証情報を取得
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      '❌ テスト用認証情報が設定されていません。\n' +
        '環境変数 TEST_USER_EMAIL と TEST_USER_PASSWORD を設定してください。\n\n' +
        '例:\n' +
        'TEST_USER_EMAIL=test@example.com TEST_USER_PASSWORD=password123 npx playwright test',
    );
  }

  console.log(`🔐 認証中: ${email}`);

  // ログインページに移動
  await page.goto('/ja/auth/login');

  // ページ読み込み完了を待つ
  await page.waitForLoadState('networkidle');

  // フォーム入力
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);

  // ログインボタンをクリック
  await page.click('button[type="submit"]');

  // ログイン成功を待つ（カレンダーページまたはMFA検証ページにリダイレクト）
  await page.waitForURL(/\/(calendar|auth\/mfa-verify)/, { timeout: 10000 });

  // MFA検証ページの場合は、このセットアップではスキップ
  // （本番では、MFAコードの自動入力も実装可能）
  const currentUrl = page.url();
  if (currentUrl.includes('mfa-verify')) {
    console.warn('⚠️ MFAが有効なユーザーです。テストではMFA無効ユーザーを推奨します。');
  }

  // 認証状態を確認（カレンダーページが表示されているか）
  if (currentUrl.includes('calendar')) {
    console.log('✅ 認証成功: カレンダーページにアクセスできました');
  }

  // 認証状態を保存
  await page.context().storageState({ path: authFile });

  console.log(`💾 認証状態を保存: ${authFile}`);
});
