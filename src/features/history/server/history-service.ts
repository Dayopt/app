/**
 * History Service
 *
 * 直近2週間の使用パターンを頻度×鮮度で集計するビジネスロジック層。
 * Router → Service → Supabase の3層構造。
 */

import type { Database } from '@/lib/database.types';
import { ServiceError } from '@/lib/trpc/errors';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────────────────

const SNAP_MINUTES = 15;
const LOOKBACK_DAYS = 14;
const RESULT_LIMIT = 8;

// ─────────────────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────────────────

/** サーバーから返す履歴アイテム */
export interface RecentBlockItem {
  tagId: string;
  durationMinutes: number;
  score: number;
}

/** entries テーブルから取得される行型（tag_id 含む） */
interface EntryTagRow {
  tag_id: string;
  duration_minutes: number | null;
  start_time: string | null;
  end_time: string | null;
  deleted_at: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────
// エラー
// ─────────────────────────────────────────────────────────

export class HistoryServiceError extends ServiceError {
  constructor(code: 'FETCH_ENTRIES_FAILED', message: string) {
    super(code, message);
    this.name = 'HistoryServiceError';
  }
}

// ─────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────

export class HistoryService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  /** 鮮度係数: 新しいエントリほど高スコア */
  private recencyWeight(createdAt: Date, now: Date): number {
    const diffMs = now.getTime() - createdAt.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays < 1) return 1.0;
    if (diffDays < 2) return 0.8;
    if (diffDays < 4) return 0.6;
    if (diffDays < 8) return 0.4;
    return 0.2;
  }

  /** duration を15分単位にスナップ */
  private snapDuration(minutes: number): number {
    return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES || SNAP_MINUTES;
  }

  /** 直近14日のエントリ+タグを取得 */
  private async fetchRecentEntries(userId: string): Promise<EntryTagRow[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

    const { data, error } = await this.supabase
      .from('entries')
      .select('tag_id, duration_minutes, start_time, end_time, deleted_at, created_at')
      .eq('user_id', userId)
      .not('tag_id', 'is', null)
      .gte('created_at', cutoff.toISOString());

    if (error) {
      throw new HistoryServiceError('FETCH_ENTRIES_FAILED', error.message);
    }

    // Supabase の inner join 型推論が不完全なため、行ごとに型を適用
    return (data ?? []) as EntryTagRow[];
  }

  /** 直近2週間の使用パターンを頻度×鮮度で集計 */
  async getRecentBlocks(userId: string): Promise<RecentBlockItem[]> {
    const rows = await this.fetchRecentEntries(userId);

    const now = new Date();
    const scores = new Map<string, RecentBlockItem>();

    for (const row of rows) {
      if (row.deleted_at) continue;

      // duration_minutes が未設定の場合、start_time/end_time から算出
      let durationMinutes = row.duration_minutes;
      if (!durationMinutes && row.start_time && row.end_time) {
        durationMinutes = Math.round(
          (new Date(row.end_time).getTime() - new Date(row.start_time).getTime()) / 60000,
        );
      }
      if (!durationMinutes || durationMinutes <= 0) continue;

      const snappedDuration = this.snapDuration(durationMinutes);
      const key = `${row.tag_id}:${snappedDuration}`;

      const weight = this.recencyWeight(new Date(row.created_at), now);
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

    // スコア降順 + 同タグは最頻duration のみ残す + 上限適用
    const sorted = Array.from(scores.values()).sort((a, b) => b.score - a.score);
    const seenTags = new Set<string>();
    return sorted
      .filter((item) => {
        if (seenTags.has(item.tagId)) return false;
        seenTags.add(item.tagId);
        return true;
      })
      .slice(0, RESULT_LIMIT);
  }
}

/** HistoryService インスタンス作成 */
export function createHistoryService(supabase: SupabaseClient<Database>) {
  return new HistoryService(supabase);
}
