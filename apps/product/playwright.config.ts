import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './src/lib/test/e2e',

  // テストの並列実行
  fullyParallel: true,

  // CI環境でのfail時にワーカーを停止しない
  forbidOnly: !!process.env.CI,

  // テスト失敗時のリトライ
  retries: process.env.CI ? 2 : 0,

  // 並列ワーカー数（GitHub Actions ubuntu-latest: 2 vCPU）
  ...(process.env.CI ? { workers: 2 } : {}),

  // タイムアウト設定
  timeout: 30 * 1000, // テスト全体: 30秒
  expect: {
    timeout: 5000, // アサーション: 5秒
  },

  // レポーター設定（JSON/JUnitはCI専用）
  reporter: process.env.CI
    ? [
        ['html'],
        ['json', { outputFile: 'test-results/e2e-results.json' }],
        ['junit', { outputFile: 'test-results/e2e-results.xml' }],
      ]
    : [['html']],

  // テスト実行設定
  use: {
    // ベースURL
    baseURL: 'http://localhost:3000',

    // アクションタイムアウト（クリック、入力等）
    actionTimeout: 10 * 1000,

    // トレース設定（失敗時のみ）
    trace: 'on-first-retry',

    // スクリーンショット設定
    screenshot: 'only-on-failure',

    // ビデオ録画設定
    video: 'retain-on-failure',
  },

  // テスト対象プロジェクト（ブラウザ別）
  // E2Eはスモーク＋クリティカルパスに縮小済み（2ファイル）
  // クロスブラウザのUI差異はStorybook側でカバー
  // @see Storybook → Docs/テスト戦略
  projects: [
    // ==========================================
    // デスクトップ（Chromiumのみ）
    // ==========================================
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },

    // ==========================================
    // モバイル（Chromeのみ）
    // ==========================================
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
      },
    },
  ],

  // 開発サーバーの起動設定
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
