import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HAS_SUPABASE_ENV = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);
const describeWithEnv = HAS_SUPABASE_ENV ? test.describe : test.describe.skip;

const TIMEZONE = 'Asia/Tokyo';
const TEST_RUN_ID = crypto.randomUUID();
const TEST_USER_ID = crypto.randomUUID();
const TEST_EMAIL = `plan-record-${TEST_RUN_ID}@example.com`;
const TEST_PASSWORD = 'test-password-123';
const TEST_TAG_NAME = `Plan Record E2E ${TEST_RUN_ID.slice(0, 8)}`;
const PLAN_TITLE = `Plan ${TEST_RUN_ID.slice(0, 8)}`;
const RECORD_TITLE = `Record ${TEST_RUN_ID.slice(0, 8)}`;

type SupabaseClient = ReturnType<typeof createClient<Database>>;

/**
 * 日付は必ず TIMEZONE 基準で決める。`test.use({ timezoneId })` は browser context
 * にしか効かず、Node 側の `Date` は runner の host TZ（CI では UTC）を返すため。
 * ここは ±14 日の余裕があるので 1 日のズレでは壊れないが、同じ helper が
 * critical-path.spec.ts では ±1 日で使われるので基準を揃えておく。
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

function isoAt(dateParam: string, hhmm: string): string {
  return new Date(`${dateParam}T${hhmm}:00+09:00`).toISOString();
}

async function login(page: Page) {
  await page.goto('/ja/auth/login');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="email"], input[name="email"]').first().fill(TEST_EMAIL);
  await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/ja\/(day|week)/i, { timeout: 15_000 });
}

async function openDay(page: Page, dateParam: string) {
  await page.goto(`/ja/day?date=${dateParam}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-calendar-grid]').first()).toBeVisible({ timeout: 10_000 });
}

describeWithEnv('Plan / Record Timeblock flow', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ timezoneId: TIMEZONE });

  let adminSupabase: SupabaseClient;
  let recordId: string;

  test.beforeAll(async () => {
    adminSupabase = createClient<Database>(SUPABASE_URL!, SUPABASE_SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: authError } = await adminSupabase.auth.admin.createUser({
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'plan record e2e' },
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

    const { data: tag, error: tagError } = await adminSupabase
      .from('tags')
      .insert({
        user_id: TEST_USER_ID,
        name: TEST_TAG_NAME,
        color: 'blue',
        icon: 'circle',
        sort_order: 0,
      })
      .select('id')
      .single();
    if (tagError) throw new Error(tagError.message);

    const planDate = offsetDateParam(14);
    const recordDate = offsetDateParam(-14);
    const { error: planError } = await adminSupabase.from('plans').insert({
      user_id: TEST_USER_ID,
      tag_id: tag.id,
      title: PLAN_TITLE,
      start_at: isoAt(planDate, '09:00'),
      end_at: isoAt(planDate, '10:00'),
    });
    if (planError) throw new Error(planError.message);

    const { data: record, error: recordError } = await adminSupabase
      .from('records')
      .insert({
        user_id: TEST_USER_ID,
        tag_id: tag.id,
        title: RECORD_TITLE,
        start_at: isoAt(recordDate, '09:00'),
        end_at: isoAt(recordDate, '10:00'),
        source: 'manual',
      })
      .select('id')
      .single();
    if (recordError) throw new Error(recordError.message);
    recordId = record.id;
  });

  test.afterAll(async () => {
    if (!adminSupabase) return;
    await adminSupabase.from('records').delete().eq('user_id', TEST_USER_ID);
    await adminSupabase.from('plans').delete().eq('user_id', TEST_USER_ID);
    await adminSupabase.from('tags').delete().eq('user_id', TEST_USER_ID);
    await adminSupabase.from('user_settings').delete().eq('user_id', TEST_USER_ID);
    await adminSupabase.from('profiles').delete().eq('id', TEST_USER_ID);
    await adminSupabase.auth.admin.deleteUser(TEST_USER_ID);
  });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('Mobile'), 'desktop-only');
    await login(page);
  });

  // lane カード（TwoLane/PlanLaneCard / RecordLaneCard）は title ではなくタグ名を表示する
  test('Plan と Record をそれぞれの Calendar 日付に表示する', async ({ page }) => {
    await openDay(page, offsetDateParam(14));
    await expect(
      page.locator('[data-plan-lane-card]', { hasText: TEST_TAG_NAME }).first(),
    ).toBeVisible({
      timeout: 10_000,
    });

    await openDay(page, offsetDateParam(-14));
    await expect(
      page.locator('[data-record-lane-card]', { hasText: TEST_TAG_NAME }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Record の Inspector URL は record prefix を使う', async ({ page }) => {
    await openDay(page, offsetDateParam(-14));
    await page.locator('[data-record-lane-card]', { hasText: TEST_TAG_NAME }).first().click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get('timeblock'))
      .toBe(`record:${recordId}`);
  });
});
