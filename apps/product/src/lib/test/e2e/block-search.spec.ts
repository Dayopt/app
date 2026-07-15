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
const TEST_EMAIL = `block-search-${TEST_RUN_ID}@example.com`;
const TEST_PASSWORD = 'test-password-123';
const SEARCH_TOKEN = TEST_RUN_ID.slice(0, 8);
const TAG_NAME = `Search tag ${SEARCH_TOKEN}`;
const PLAN_NOTE = `Plan note ${SEARCH_TOKEN}`;
const RECORD_NOTE = `Record note ${SEARCH_TOKEN}`;
const PLAN_COMPATIBILITY_TITLE = `Legacy plan ${SEARCH_TOKEN}`;
const RECORD_COMPATIBILITY_TITLE = `Legacy record ${SEARCH_TOKEN}`;

type SupabaseClient = ReturnType<typeof createClient<Database>>;

function formatDateParam(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function offsetDateParam(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return formatDateParam(date);
}

function isoAt(dateParam: string, hhmm: string): string {
  return new Date(`${dateParam}T${hhmm}:00+09:00`).toISOString();
}

async function login(page: Page) {
  await page.goto('/ja/auth/login');
  await page.locator('input[type="email"], input[name="email"]').first().fill(TEST_EMAIL);
  await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/ja\/(day|week)/i, { timeout: 15_000 });
}

describeWithEnv('Block search', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ timezoneId: TIMEZONE });

  let adminSupabase: SupabaseClient;
  let planId: string;
  let recordId: string;
  const planDate = offsetDateParam(14);
  const recordDate = offsetDateParam(-14);

  test.beforeAll(async () => {
    adminSupabase = createClient<Database>(SUPABASE_URL!, SUPABASE_SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: authError } = await adminSupabase.auth.admin.createUser({
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'block search e2e' },
    });
    if (authError && !authError.message.includes('already exists'))
      throw new Error(authError.message);

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
        name: TAG_NAME,
        color: 'blue',
        icon: 'circle',
        sort_order: 0,
      })
      .select('id')
      .single();
    if (tagError) throw new Error(tagError.message);

    const { data: plan, error: planError } = await adminSupabase
      .from('plans')
      .insert({
        user_id: TEST_USER_ID,
        tag_id: tag.id,
        title: PLAN_COMPATIBILITY_TITLE,
        note: PLAN_NOTE,
        start_at: isoAt(planDate, '09:00'),
        end_at: isoAt(planDate, '10:00'),
      })
      .select('id')
      .single();
    if (planError) throw new Error(planError.message);
    planId = plan.id;

    const { data: record, error: recordError } = await adminSupabase
      .from('records')
      .insert({
        user_id: TEST_USER_ID,
        tag_id: tag.id,
        title: RECORD_COMPATIBILITY_TITLE,
        note: RECORD_NOTE,
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

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('desktop shortcut・note/tag検索・Inspector遷移がつながる', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('Mobile'), 'desktop-only');

    await page.keyboard.press('Control+K');
    const input = page.getByRole('combobox', { name: '予定と記録を検索' });
    await input.fill(RECORD_NOTE);
    await page.getByText(RECORD_NOTE).click();
    await expect(input).toHaveCount(0);
    await expect
      .poll(() => new URL(page.url()).searchParams.get('timeblock'))
      .toBe(`record:${recordId}`);
    expect(new URL(page.url()).searchParams.get('date')).toBe(recordDate);
    await expect(page.getByRole('dialog', { name: TAG_NAME })).toBeVisible();

    await page.getByRole('button', { name: 'ブロックを検索' }).first().click();
    await page.getByRole('combobox', { name: '予定と記録を検索' }).fill(TAG_NAME);
    await expect(page.getByText(PLAN_NOTE)).toBeVisible();
    await expect(page.getByText(RECORD_NOTE)).toBeVisible();
    await page.getByText(PLAN_NOTE).click();

    await expect
      .poll(() => new URL(page.url()).searchParams.get('timeblock'))
      .toBe(`plan:${planId}`);
    expect(new URL(page.url()).searchParams.get('date')).toBe(planDate);
    await expect(page.getByRole('dialog', { name: TAG_NAME })).toBeVisible();
  });

  test('mobileは展開mini calendarから検索を開ける', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('Mobile'), 'mobile-only');

    await page.getByRole('button', { name: 'カレンダーを開く' }).click();
    await page.getByRole('button', { name: 'ブロックを検索' }).click();
    await page.getByRole('combobox', { name: '予定と記録を検索' }).fill(TAG_NAME);

    await expect(page.getByText(PLAN_NOTE)).toBeVisible();
    await expect(page.getByText(RECORD_NOTE)).toBeVisible();
  });
});
