import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database';
import { resolveServiceRoleTarget } from './service-role-target-guard';
import { suppressConsentBanner } from './suppress-consent-banner';

/**
 * クリティカルパス E2E — 計画 → 実績 → 振り返りの中核ループを実 UI 操作で通す
 *
 * 「作成導線が存在する」ではなく、ドラッグ選択 → アクティビティ選択で実際に Plan / Record を作り、
 * リロード後も残る（= DB へ永続化された）ことと、Review panel の Time P/L へ反映される
 * ことを検証する。
 *
 * 過去帯ドラッグでパレットが開かない症状は、ドラッグ x 座標が Plan lane 側
 * （`box.width * 0.15`）だったことが原因だった。過去日は Plan 追加が禁止される
 * （temporal-constraints.md）ため、Record lane 側（`box.width * 0.6`）へ変更して解消した。
 *
 * seed は service role で自前ユーザーを作る（block-search.spec.ts と同型）。
 * 実行先は resolveServiceRoleTarget が安全と判定した時だけ有効になる。
 *
 * @see docs/engineering/log/2026-07-13-test-automation-strategy.md
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// service role で auth user / plan / record を作って消すため、実行先が安全な時だけ有効にする
const SERVICE_ROLE_TARGET = resolveServiceRoleTarget(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const describeWithEnv = SERVICE_ROLE_TARGET.safe ? test.describe : test.describe.skip;

const TIMEZONE = 'Asia/Tokyo';
const TEST_RUN_ID = crypto.randomUUID();
const TEST_USER_ID = crypto.randomUUID();
const TEST_EMAIL = `critical-path-${TEST_RUN_ID}@example.com`;
const TEST_PASSWORD = 'test-password-123';
const ACTIVITY_NAME = `Journey ${TEST_RUN_ID.slice(0, 8)}`;

type SupabaseClient = ReturnType<typeof createClient<Database>>;

/**
 * 日付は必ず TIMEZONE 基準で決める。
 *
 * `test.use({ timezoneId })` が効くのは browser context だけで、Node 側の
 * `Date` の getFullYear / getMonth / getDate は runner の host TZ を返す。
 * CI runner は UTC なので、Tokyo の 00:00-09:00（UTC では前日 15:00-24:00）に
 * 実行すると host 日付が Tokyo より 1 日前になり、`tomorrow` が当日へ落ちて
 * 09:00 が過去になる = Plan ではなく Record が作られて assertion が壊れる。
 */
const DATE_PARAM_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function offsetDateParam(offsetDays: number): string {
  // Asia/Tokyo は DST を持たないため、24h 加算と暦日加算が一致する
  return DATE_PARAM_FORMAT.format(new Date(Date.now() + offsetDays * 86_400_000));
}

async function login(page: Page) {
  await suppressConsentBanner(page);
  await page.goto('/ja/auth/login');
  await page.locator('input[type="email"], input[name="email"]').first().fill(TEST_EMAIL);
  await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/ja\/(day|week)/i, { timeout: 15_000 });
}

async function openDay(page: Page, dateParam: string) {
  await page.goto(`/ja/day?date=${dateParam}`);
  await expect(page.locator('[data-calendar-grid]').first()).toBeVisible({ timeout: 10_000 });
}

/**
 * カレンダーグリッド上を hourFrom → hourTo までドラッグ選択する。
 *
 * - グリッドは 00:00-24:00 を等分するので hourHeight = grid高さ / 24
 * - ドラッグ選択は mouse イベント + 5px 超の移動で成立（useDragSelection.ts）
 * - 対象時間帯が viewport 外だと mouse 座標が届かないため、先にスクロールで露出させる
 */
async function dragSelect(page: Page, hourFrom: number, hourTo: number) {
  const grid = page.locator('[data-calendar-grid][data-calendar-day-index="0"]').first();
  await expect(grid).toBeVisible({ timeout: 10_000 });

  const gridHeight = await grid.evaluate((el) => el.getBoundingClientRect().height);
  const hourHeight = gridHeight / 24;

  // 対象時間帯をスクロールで露出させる（1 時間分の余白を上に残す）
  await page
    .locator('[data-calendar-scroll]')
    .first()
    .evaluate(
      (el, top) => {
        // html の scroll-behavior: smooth でアニメーションすると直後の boundingBox が確定しない
        el.scrollTo({ top, behavior: 'instant' });
      },
      hourHeight * (hourFrom - 1),
    );

  const box = await grid.boundingBox();
  if (!box) throw new Error('calendar grid is not visible');

  const x = box.x + box.width * 0.6; // record lane 側
  const yFrom = box.y + hourHeight * hourFrom;
  const yTo = box.y + hourHeight * hourTo;

  await page.mouse.move(x, yFrom);
  await page.mouse.down();
  // mousemove は rAF スロットルされるため中間 move を挟んで hasDragged を確定させる
  await page.mouse.move(x, yFrom + 24, { steps: 4 });
  await page.mouse.move(x, yTo, { steps: 8 });
  await page.mouse.up();
}

describeWithEnv('Critical Path: 計画 → 実績 → 振り返り', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ timezoneId: TIMEZONE });

  let adminSupabase: SupabaseClient;
  const tomorrow = offsetDateParam(1);

  test.beforeAll(async () => {
    adminSupabase = createClient<Database>(SUPABASE_URL!, SUPABASE_SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: authError } = await adminSupabase.auth.admin.createUser({
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'critical path e2e' },
    });
    if (authError && !authError.message.includes('already exists')) {
      throw new Error(authError.message);
    }

    await adminSupabase.from('profiles').upsert({
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await adminSupabase.from('user_settings').upsert({
      user_id: TEST_USER_ID,
      timezone: TIMEZONE,
      preferred_locale: 'ja',
      default_view: 'day',
      default_duration: 60,
      time_format: '24h',
      week_starts_on: 1,
    });

    // 色・アイコンを持つのはカテゴリーだけで、アクティビティは継承する（#2162 §4-6）
    const { data: category, error: categoryError } = await adminSupabase
      .from('categories')
      .insert({
        user_id: TEST_USER_ID,
        name: `Cat ${TEST_RUN_ID.slice(0, 8)}`,
        color: 'blue',
        icon: 'circle',
      })
      .select()
      .single();
    if (categoryError) throw new Error(categoryError.message);

    const { error: activityError } = await adminSupabase.from('activities').insert({
      user_id: TEST_USER_ID,
      category_id: category.id,
      name: ACTIVITY_NAME,
    });
    if (activityError) throw new Error(activityError.message);
  });

  test.afterAll(async () => {
    if (!adminSupabase) return;
    await adminSupabase.from('records').delete().eq('user_id', TEST_USER_ID);
    await adminSupabase.from('plans').delete().eq('user_id', TEST_USER_ID);
    await adminSupabase.from('activities').delete().eq('user_id', TEST_USER_ID);
    await adminSupabase.from('categories').delete().eq('user_id', TEST_USER_ID);
    await adminSupabase.from('user_settings').delete().eq('user_id', TEST_USER_ID);
    await adminSupabase.from('profiles').delete().eq('id', TEST_USER_ID);
    await adminSupabase.auth.admin.deleteUser(TEST_USER_ID);
  });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name.includes('Mobile'),
      'desktop-only（ドラッグ座標は desktop 前提）',
    );
    await login(page);
  });

  test('ドラッグ選択とアクティビティ選択で明日の Plan を作成し、リロード後も残る', async ({
    page,
  }) => {
    await openDay(page, tomorrow);

    await dragSelect(page, 9, 10);

    // InlineActivityPalette → アクティビティ選択ダイアログ
    const activityDialog = page.getByRole('dialog', { name: 'アクティビティを選択' });
    await expect(activityDialog).toBeVisible({ timeout: 10_000 });
    await activityDialog.getByRole('button', { name: ACTIVITY_NAME }).click();

    // Plan lane にカードが現れる（lane カードはアクティビティ名を表示する）
    const planCard = page.locator('[data-plan-lane-card]', { hasText: ACTIVITY_NAME }).first();
    await expect(planCard).toBeVisible({ timeout: 10_000 });

    // リロードしても残る = DB へ永続化されている
    await page.reload();
    await expect(page.locator('[data-calendar-grid]').first()).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('[data-plan-lane-card]', { hasText: ACTIVITY_NAME }).first(),
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test('過去帯をドラッグして Record を記録し、リロード後も残る', async ({ page }) => {
    await openDay(page, offsetDateParam(-1));

    await dragSelect(page, 9, 10);

    // InlineActivityPalette → アクティビティ選択ダイアログ
    const activityDialog = page.getByRole('dialog', { name: 'アクティビティを選択' });
    await expect(activityDialog).toBeVisible({ timeout: 10_000 });
    await activityDialog.getByRole('button', { name: ACTIVITY_NAME }).click();

    // Record レーンにカードが現れる（lane カードはアクティビティ名を表示する）
    const recordCard = page.locator('[data-record-lane-card]', { hasText: ACTIVITY_NAME }).first();
    await expect(recordCard).toBeVisible({ timeout: 10_000 });

    // リロードしても残る = DB へ永続化されている
    await page.reload();
    await expect(page.locator('[data-calendar-grid]').first()).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator('[data-record-lane-card]', { hasText: ACTIVITY_NAME }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('記録した実績が Review panel の Time P/L に反映される', async ({ page }) => {
    await page.goto(`/ja/day?date=${offsetDateParam(-1)}&panel=review`);

    // CalendarReviewPanel の section は aria-label のみ持ち、暗黙 role="region" になる
    const reviewPanel = page.getByRole('region', { name: '振り返り' });
    await expect(reviewPanel).toBeVisible({ timeout: 10_000 });

    // TimePLRow はアクティビティ名を含む button（day view は単日スコープなので明日の Plan は混入しない）
    const tagRow = reviewPanel.getByRole('button', { name: new RegExp(ACTIVITY_NAME) });
    await expect(tagRow).toBeVisible({ timeout: 10_000 });
    await expect(tagRow).toContainText('1h');
  });
});
