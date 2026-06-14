import { expect, test } from '@playwright/test';

/**
 * Review 粒度別ビュー スモーク
 *
 * review-granularity-redesign の regression guard:
 * /review?g={day|week} の deep link で各粒度の composition が
 * 描画されること（= URL からの粒度復元が機能していること）を検証する。
 *
 * 各粒度に固有のセクション見出しが出れば、デフォルト（週）ではなく
 * 指定粒度のビューが描画された証拠になる。テストユーザーのデータ有無に
 * 依存しないよう、空状態の文言も許容する。
 */

const SKIP_AUTH_TESTS = !process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD;

async function login(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('input[type="password"]').first();
  const submitButton = page.locator('button[type="submit"]').first();

  await emailInput.fill(process.env.TEST_USER_EMAIL!);
  await passwordInput.fill(process.env.TEST_USER_PASSWORD!);
  await submitButton.click();

  await page.waitForURL(/\/(calendar|review)/i, { timeout: 15000 });
}

/** 粒度ごとの「そのビューが描画された証拠」となるテキスト（データなしは空状態文言を許容） */
const GRANULARITY_MARKERS: Record<string, RegExp> = {
  day: /予定と実績|Planned vs actual|まっさらな1日です|A fresh day/,
  week: /曜日別の記録|By day of week|新しい1週間が始まりました|No review data yet/,
};

test.describe('Smoke: Review 粒度別ビュー', () => {
  test.skip(SKIP_AUTH_TESTS, 'TEST_USER_EMAIL / TEST_USER_PASSWORD が未設定');

  for (const [granularity, marker] of Object.entries(GRANULARITY_MARKERS)) {
    test(`/review?g=${granularity} が粒度固有のビューを描画する`, async ({ page }) => {
      await login(page);

      await page.goto(`/ja/review?g=${granularity}`);
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(new RegExp(`/ja/review\\?g=${granularity}`));

      await expect(page.getByText(marker).first()).toBeVisible({ timeout: 15000 });
    });
  }
});
