/**
 * History Router
 *
 * 直近2週間の使用パターンを頻度×鮮度で集計し、
 * 「今の自分」を反映した履歴ブロックを返す。
 */

import { createTRPCRouter, protectedProcedure } from '@/platform/trpc/procedures';

const SNAP_MINUTES = 15;
const LOOKBACK_DAYS = 14;

/** 鮮度係数: 新しいエントリほど高スコア */
function recencyWeight(createdAt: Date, now: Date): number {
  const diffMs = now.getTime() - createdAt.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays < 1) return 1.0;
  if (diffDays < 2) return 0.8;
  if (diffDays < 4) return 0.6;
  if (diffDays < 8) return 0.4;
  return 0.2;
}

/** duration を15分単位にスナップ */
function snapDuration(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES || SNAP_MINUTES;
}

/** 直近2週間の使用パターンを頻度×鮮度で集計 */
const getRecentBlocks = protectedProcedure
  .meta({ description: '直近2週間の使用パターンを頻度×鮮度で集計' })
  .query(async ({ ctx }) => {
    // 1. ピン留め済みの組み合わせを取得（除外用）
    const { data: pinned } = await ctx.supabase
      .from('palette_items')
      .select('tag_id, duration_minutes')
      .eq('user_id', ctx.userId)
      .eq('is_pinned', true);

    const pinnedSet = new Set((pinned ?? []).map((p) => `${p.tag_id}:${p.duration_minutes}`));

    // 2. 直近14日のエントリ+タグを取得
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - LOOKBACK_DAYS);

    const { data, error } = await ctx.supabase
      .from('entry_tags')
      .select(
        'tag_id, entries!inner(duration_minutes, start_time, end_time, deleted_at, created_at)',
      )
      .eq('user_id', ctx.userId)
      .gte('entries.created_at', twoWeeksAgo.toISOString());

    if (error) {
      throw error;
    }

    // 3. 15分スナップ + 頻度×鮮度スコアリング
    const now = new Date();
    const scores = new Map<string, { tagId: string; durationMinutes: number; score: number }>();

    for (const row of data ?? []) {
      const entry = row.entries as unknown as {
        duration_minutes: number | null;
        start_time: string | null;
        end_time: string | null;
        deleted_at: string | null;
        created_at: string;
      };

      if (entry.deleted_at) continue;

      // duration_minutes が未設定の場合、start_time/end_time から算出
      let durationMinutes = entry.duration_minutes;
      if (!durationMinutes && entry.start_time && entry.end_time) {
        durationMinutes = Math.round(
          (new Date(entry.end_time).getTime() - new Date(entry.start_time).getTime()) / 60000,
        );
      }
      if (!durationMinutes || durationMinutes <= 0) continue;

      const snappedDuration = snapDuration(durationMinutes);
      const key = `${row.tag_id}:${snappedDuration}`;

      // 4. ピン留め済みを除外
      if (pinnedSet.has(key)) continue;

      const weight = recencyWeight(new Date(entry.created_at), now);
      const existing = scores.get(key);

      if (existing) {
        existing.score += weight;
      } else {
        scores.set(key, {
          tagId: row.tag_id,
          durationMinutes: snappedDuration,
          score: weight,
        });
      }
    }

    // 5. スコア降順 + 同タグは最頻duration のみ残す
    const sorted = Array.from(scores.values()).sort((a, b) => b.score - a.score);
    const seenTags = new Set<string>();
    return sorted.filter((item) => {
      if (seenTags.has(item.tagId)) return false;
      seenTags.add(item.tagId);
      return true;
    });
  });

export const historyRouter = createTRPCRouter({
  getRecentBlocks,
});
