import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@dayopt/database';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HAS_SUPABASE_ENV = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_KEY);

const describeWithEnv = HAS_SUPABASE_ENV ? test.describe : test.describe.skip;

const TIMEZONE = 'Asia/Tokyo';
const TEST_RUN_ID = crypto.randomUUID();
const TEST_USER_ID = crypto.randomUUID();
const TEST_EMAIL = `entry-two-layer-${TEST_RUN_ID}@example.com`;
const TEST_PASSWORD = 'test-password-123';
const TEST_TAG_NAME = `E2E二層 ${TEST_RUN_ID.slice(0, 8)}`;

type SupabaseClient = ReturnType<typeof createClient<Database>>;
type EntryRow = Database['public']['Tables']['entries']['Row'];

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

function isSameInstant(value: string | null | undefined, expectedIso: string): boolean {
  return value != null && new Date(value).getTime() === new Date(expectedIso).getTime();
}

async function login(page: Page) {
  await page.goto('/ja/auth/login');
  await page.waitForLoadState('networkidle');

  await page.locator('input[type="email"], input[name="email"]').first().fill(TEST_EMAIL);
  await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').first().click();

  await page.waitForURL(/\/ja\/calendar\//i, { timeout: 15_000 });
}

async function openDay(page: Page, dateParam: string) {
  await page.goto(`/ja/calendar/day?date=${dateParam}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-calendar-grid]').first()).toBeVisible({ timeout: 10_000 });
}

async function doubleClickTime(page: Page, hour: number, minute = 0) {
  const point = await page
    .locator('[data-calendar-grid]')
    .first()
    .evaluate(
      (grid, time) => {
        const scroll = grid.closest('[data-calendar-scroll]') as HTMLElement | null;
        if (!scroll) throw new Error('calendar scroll container not found');

        const gridRect = grid.getBoundingClientRect();
        const gridHeight = Math.max(grid.scrollHeight, gridRect.height);
        const hourHeight = gridHeight / 24;
        const yInGrid = (time.hour * 60 + time.minute) * (hourHeight / 60);

        scroll.scrollTop = Math.max(0, yInGrid - scroll.clientHeight / 2);

        const nextRect = grid.getBoundingClientRect();
        return {
          x: nextRect.left + nextRect.width / 2,
          y: nextRect.top + yInGrid - scroll.scrollTop,
        };
      },
      { hour, minute },
    );

  await page.mouse.dblclick(point.x, point.y);
}

async function createEntryFromCalendar(page: Page, dateParam: string, hour: number) {
  await openDay(page, dateParam);
  await doubleClickTime(page, hour);

  await expect(page.locator('[data-tag-palette]')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: TEST_TAG_NAME }).click();

  await expect(page.locator('[data-entry-card]', { hasText: TEST_TAG_NAME }).first()).toBeVisible({
    timeout: 10_000,
  });
}

async function selectEntry(page: Page, dateParam: string) {
  await openDay(page, dateParam);
  const card = page.locator('[data-entry-card]', { hasText: TEST_TAG_NAME }).first();
  await expect(card).toBeVisible({ timeout: 10_000 });
  await card.click();
}

async function selectTagFromGap(page: Page) {
  await page.getByRole('button', { name: /空き時間に記録を追加|Add record to open time/ }).click();
  await expect(page.locator('[data-tag-palette]')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: TEST_TAG_NAME }).click();
}

async function listEntries(adminSupabase: SupabaseClient): Promise<EntryRow[]> {
  const { data, error } = await adminSupabase
    .from('entries')
    .select('*')
    .eq('user_id', TEST_USER_ID)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function seedEntry(
  adminSupabase: SupabaseClient,
  input: Database['public']['Tables']['entries']['Insert'],
): Promise<EntryRow> {
  const { data, error } = await adminSupabase.from('entries').insert(input).select('*').single();

  if (error) throw new Error(error.message);
  return data;
}

async function waitForEntries(
  adminSupabase: SupabaseClient,
  predicate: (entries: EntryRow[]) => boolean,
): Promise<EntryRow[]> {
  let latest: EntryRow[] = [];
  await expect
    .poll(
      async () => {
        latest = await listEntries(adminSupabase);
        return predicate(latest);
      },
      { timeout: 10_000 },
    )
    .toBe(true);
  return latest;
}

describeWithEnv('Entry two-layer planned/unplanned flow', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ timezoneId: TIMEZONE });

  let adminSupabase: SupabaseClient;
  let tagId: string;

  test.beforeAll(async () => {
    adminSupabase = createClient<Database>(SUPABASE_URL!, SUPABASE_SERVICE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: authError } = await adminSupabase.auth.admin.createUser({
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'entry two layer e2e' },
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
    tagId = tag.id;
  });

  test.afterAll(async () => {
    if (!adminSupabase) return;
    await adminSupabase.from('entries').delete().eq('user_id', TEST_USER_ID);
    await adminSupabase.from('tags').delete().eq('user_id', TEST_USER_ID);
    await adminSupabase.from('user_settings').delete().eq('user_id', TEST_USER_ID);
    await adminSupabase.from('profiles').delete().eq('id', TEST_USER_ID);
    await adminSupabase.auth.admin.deleteUser(TEST_USER_ID);
  });

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes('Mobile'), 'desktop-only');
    await adminSupabase.from('entries').delete().eq('user_id', TEST_USER_ID);
    await login(page);
  });

  test('過去に新規作成するとunplannedになる', async ({ page }) => {
    const dateParam = offsetDateParam(-14);

    await createEntryFromCalendar(page, dateParam, 9);

    const [entry] = await waitForEntries(adminSupabase, (entries) => entries.length === 1);
    expect(entry?.origin).toBe('unplanned');
    expect(entry?.start_time).toBeNull();
    expect(entry?.end_time).toBeNull();
    expect(entry?.actual_start_time).not.toBeNull();
    expect(entry?.actual_end_time).not.toBeNull();
  });

  test('未来に新規作成するとplannedになりactualも同じ範囲で初期化される', async ({ page }) => {
    const dateParam = offsetDateParam(14);

    await createEntryFromCalendar(page, dateParam, 9);

    const [entry] = await waitForEntries(adminSupabase, (entries) => entries.length === 1);
    expect(entry?.origin).toBe('planned');
    expect(isSameInstant(entry?.start_time, isoAt(dateParam, '09:00'))).toBe(true);
    expect(isSameInstant(entry?.end_time, isoAt(dateParam, '10:00'))).toBe(true);
    expect(entry?.actual_start_time).toBe(entry?.start_time);
    expect(entry?.actual_end_time).toBe(entry?.end_time);
  });

  test('plannedのactual短縮後、空き枠からunplannedを作れる', async ({ page }) => {
    const dateParam = offsetDateParam(-7);
    await seedEntry(adminSupabase, {
      user_id: TEST_USER_ID,
      tag_id: tagId,
      title: TEST_TAG_NAME,
      origin: 'planned',
      start_time: isoAt(dateParam, '10:00'),
      end_time: isoAt(dateParam, '11:00'),
      actual_start_time: isoAt(dateParam, '10:00'),
      actual_end_time: isoAt(dateParam, '11:00'),
      duration_minutes: 60,
    });

    await selectEntry(page, dateParam);
    const actualEnd = page.getByTestId('entry-inspector-actual-time-end');
    await actualEnd.fill('10:30');
    await actualEnd.press('Enter');

    await waitForEntries(adminSupabase, ([entry]) =>
      isSameInstant(entry?.actual_end_time, isoAt(dateParam, '10:30')),
    );
    await expect(
      page.getByRole('button', { name: /空き時間に記録を追加|Add record to open time/ }),
    ).toBeVisible({ timeout: 10_000 });

    await selectTagFromGap(page);

    const entries = await waitForEntries(
      adminSupabase,
      (rows) =>
        rows.length === 2 &&
        rows.some(
          (entry) =>
            entry.origin === 'unplanned' &&
            entry.start_time === null &&
            entry.end_time === null &&
            isSameInstant(entry.actual_start_time, isoAt(dateParam, '10:30')) &&
            isSameInstant(entry.actual_end_time, isoAt(dateParam, '11:00')),
        ),
    );

    expect(entries.filter((entry) => entry.origin === 'unplanned')).toHaveLength(1);
  });

  test('plannedのactual開始遅れ後、前半空き枠からunplannedを作れる', async ({ page }) => {
    const dateParam = offsetDateParam(-8);
    await seedEntry(adminSupabase, {
      user_id: TEST_USER_ID,
      tag_id: tagId,
      title: TEST_TAG_NAME,
      origin: 'planned',
      start_time: isoAt(dateParam, '10:00'),
      end_time: isoAt(dateParam, '11:00'),
      actual_start_time: isoAt(dateParam, '10:00'),
      actual_end_time: isoAt(dateParam, '11:00'),
      duration_minutes: 60,
    });

    await selectEntry(page, dateParam);
    const actualStart = page.getByTestId('entry-inspector-actual-time-start');
    await actualStart.fill('10:30');
    await actualStart.press('Enter');

    await waitForEntries(adminSupabase, ([entry]) =>
      isSameInstant(entry?.actual_start_time, isoAt(dateParam, '10:30')),
    );
    await expect(
      page.getByRole('button', { name: /空き時間に記録を追加|Add record to open time/ }),
    ).toBeVisible({ timeout: 10_000 });

    await selectTagFromGap(page);

    const entries = await waitForEntries(
      adminSupabase,
      (rows) =>
        rows.length === 2 &&
        rows.some(
          (entry) =>
            entry.origin === 'planned' &&
            isSameInstant(entry.start_time, isoAt(dateParam, '10:00')) &&
            isSameInstant(entry.end_time, isoAt(dateParam, '11:00')) &&
            isSameInstant(entry.actual_start_time, isoAt(dateParam, '10:30')) &&
            isSameInstant(entry.actual_end_time, isoAt(dateParam, '11:00')),
        ) &&
        rows.some(
          (entry) =>
            entry.origin === 'unplanned' &&
            entry.start_time === null &&
            entry.end_time === null &&
            isSameInstant(entry.actual_start_time, isoAt(dateParam, '10:00')) &&
            isSameInstant(entry.actual_end_time, isoAt(dateParam, '10:30')),
        ),
    );

    expect(entries.filter((entry) => entry.origin === 'unplanned')).toHaveLength(1);
  });

  test('unplannedは未来へドラッグできない', async ({ page }) => {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    test.skip(nowMinutes < 180 || nowMinutes > 20 * 60, 'today内で未来移動を検証できる時間帯のみ');

    const dateParam = formatDateParam(now);
    const originalStartMinutes = nowMinutes - 180;
    const originalEndMinutes = nowMinutes - 120;
    const originalStart = `${Math.floor(originalStartMinutes / 60)
      .toString()
      .padStart(2, '0')}:${(originalStartMinutes % 60).toString().padStart(2, '0')}`;
    const originalEnd = `${Math.floor(originalEndMinutes / 60)
      .toString()
      .padStart(2, '0')}:${(originalEndMinutes % 60).toString().padStart(2, '0')}`;
    const targetStartMinutes = nowMinutes + 30;
    const deltaMinutes = targetStartMinutes - originalStartMinutes;

    const entry = await seedEntry(adminSupabase, {
      user_id: TEST_USER_ID,
      tag_id: tagId,
      title: TEST_TAG_NAME,
      origin: 'unplanned',
      start_time: null,
      end_time: null,
      actual_start_time: isoAt(dateParam, originalStart),
      actual_end_time: isoAt(dateParam, originalEnd),
      duration_minutes: 0,
    });

    await openDay(page, dateParam);
    const card = page.locator('[data-entry-card][data-entry-origin="unplanned"]').first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    const deltaY = await page
      .locator('[data-calendar-grid]')
      .first()
      .evaluate((grid, minutes) => {
        const gridRect = grid.getBoundingClientRect();
        const gridHeight = Math.max(grid.scrollHeight, gridRect.height);
        const hourHeight = gridHeight / 24;
        return minutes * (hourHeight / 60);
      }, deltaMinutes);

    const box = await card.boundingBox();
    if (!box) throw new Error('unplanned entry card is not visible');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + deltaY, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(750);

    const { data: after, error } = await adminSupabase
      .from('entries')
      .select('*')
      .eq('id', entry.id)
      .single();
    if (error) throw new Error(error.message);

    expect(after.actual_start_time).toBe(entry.actual_start_time);
    expect(after.actual_end_time).toBe(entry.actual_end_time);
    expect(after.start_time).toBeNull();
    expect(after.end_time).toBeNull();
  });
});
