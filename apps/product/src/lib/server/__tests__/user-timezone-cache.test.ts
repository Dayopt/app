import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getUserTimezone, invalidateUserTimezoneCache } from '@/lib/server/user-timezone-cache';

import type { Database } from '@/lib/database';
import type { SupabaseClient } from '@supabase/supabase-js';

const captureUnexpectedDatabaseError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/sentry', () => ({ captureUnexpectedDatabaseError }));

type Client = SupabaseClient<Database>;

/**
 * Supabase client の `from().select().eq().single()` を模す最小限のモック。
 * 呼び出し回数と返却する timezone を差し込み可能にする。
 */
function createMockSupabase(
  timezone: string | null,
  error: { message: string; code?: string } | null = null,
) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: error ? null : { timezone }, error });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });

  const client = { from } as unknown as Client;
  return { client, maybeSingle, from };
}

describe('user-timezone-cache', () => {
  beforeEach(() => {
    // cache は module-level singleton のため、test ごとにユニーク userId で汚染を避ける
  });

  it('初回呼び出しで DB を引き、2 回目は cache から返す', async () => {
    const userId = `user-${crypto.randomUUID()}`;
    const { client, maybeSingle } = createMockSupabase('Asia/Tokyo');

    const first = await getUserTimezone(client, userId);
    expect(first).toBe('Asia/Tokyo');
    expect(maybeSingle).toHaveBeenCalledTimes(1);

    const second = await getUserTimezone(client, userId);
    expect(second).toBe('Asia/Tokyo');
    expect(maybeSingle).toHaveBeenCalledTimes(1); // cache hit
  });

  it('invalidateUserTimezoneCache の後は DB を再度引く', async () => {
    const userId = `user-${crypto.randomUUID()}`;
    const { client, maybeSingle } = createMockSupabase('Asia/Tokyo');

    await getUserTimezone(client, userId);
    expect(maybeSingle).toHaveBeenCalledTimes(1);

    invalidateUserTimezoneCache(userId);

    await getUserTimezone(client, userId);
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });

  it('settings 更新シナリオ: 旧 tz → invalidate → 新 tz が即反映', async () => {
    const userId = `user-${crypto.randomUUID()}`;

    const oldClient = createMockSupabase('UTC');
    expect(await getUserTimezone(oldClient.client, userId)).toBe('UTC');

    // settings.update で timezone 変更 → invalidate
    invalidateUserTimezoneCache(userId);

    // 次の取得は新しい tz を反映（DB 側が Asia/Tokyo を返すよう差し替え）
    const newClient = createMockSupabase('Asia/Tokyo');
    expect(await getUserTimezone(newClient.client, userId)).toBe('Asia/Tokyo');
  });

  it('DB の timezone が null の場合は UTC にフォールバック', async () => {
    const userId = `user-${crypto.randomUUID()}`;
    const { client } = createMockSupabase(null);

    expect(await getUserTimezone(client, userId)).toBe('UTC');
  });

  it('DB 障害を一度captureし、UTCへフォールバックする', async () => {
    const userId = `user-${crypto.randomUUID()}`;
    const dbError = { message: 'database unavailable', code: 'PGRST000' };
    const { client } = createMockSupabase(null, dbError);

    expect(await getUserTimezone(client, userId)).toBe('UTC');
    expect(captureUnexpectedDatabaseError).toHaveBeenCalledWith(dbError, {
      feature: 'user_settings',
      operation: 'get_cached_user_timezone',
    });
  });

  it('invalidate は存在しない userId でも throw しない', () => {
    expect(() => invalidateUserTimezoneCache('nonexistent-user')).not.toThrow();
  });
});
