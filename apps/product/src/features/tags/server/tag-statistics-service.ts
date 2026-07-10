import 'server-only';

import type { Database } from '@/lib/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TagServiceError } from './tag-service-error';

export interface TagStatsRow {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  entry_count: number;
  last_used_at: string | null;
}

export class TagStatisticsService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async getStats(userId: string): Promise<TagStatsRow[]> {
    const { data: tags, error: tagsError } = await this.supabase
      .from('tags')
      .select('id, name, color, icon')
      .eq('user_id', userId)
      .eq('is_active', true);
    if (tagsError) {
      throw new TagServiceError('FETCH_FAILED', `Failed to fetch tags: ${tagsError.message}`);
    }
    if (!tags || tags.length === 0) return [];

    const { data: statsRows, error: statsError } = await this.supabase.rpc('get_tag_stats', {
      p_user_id: userId,
    });
    if (statsError) {
      throw new TagServiceError('FETCH_FAILED', `Failed to fetch tag stats: ${statsError.message}`);
    }

    const statsMap = new Map(
      (statsRows ?? []).map((row) => [
        row.tag_id,
        { entry_count: row.entry_count, last_used: row.last_used },
      ]),
    );
    return tags
      .map((tag) => {
        const stats = statsMap.get(tag.id);
        return {
          id: tag.id,
          name: tag.name,
          color: tag.color,
          icon: tag.icon,
          entry_count: stats?.entry_count ?? 0,
          last_used_at: stats?.last_used ?? null,
        };
      })
      .sort((a, b) => b.entry_count - a.entry_count);
  }

  /**
   * Step 4: `get_tag_stats` RPC の代わりに `logs`（実績）を直接集計するタグ統計。
   *
   * `tags` は Layer 0 のため `features/entry/domain` を import できない（feature DAG）。
   * `entries.getTagStats` procedure と同じ意味論（実績ベースの件数・最終使用日）を
   * ここで独立に計算する。**dormant**: router から未接続。Step 8 で `getStats` の
   * 呼び出し元を切り替える前提。
   */
  async getStatsFromLogs(userId: string): Promise<TagStatsRow[]> {
    const { data: tags, error: tagsError } = await this.supabase
      .from('tags')
      .select('id, name, color, icon')
      .eq('user_id', userId)
      .eq('is_active', true);
    if (tagsError) {
      throw new TagServiceError('FETCH_FAILED', `Failed to fetch tags: ${tagsError.message}`);
    }
    if (!tags || tags.length === 0) return [];

    const { data: logs, error: logsError } = await this.supabase
      .from('logs')
      .select('tag_id, start_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .not('tag_id', 'is', null);
    if (logsError) {
      throw new TagServiceError('FETCH_FAILED', `Failed to fetch logs: ${logsError.message}`);
    }

    const statsMap = new Map<string, { entry_count: number; last_used: string }>();
    for (const log of logs ?? []) {
      if (!log.tag_id) continue;
      const existing = statsMap.get(log.tag_id);
      if (existing) {
        existing.entry_count += 1;
        if (log.start_at > existing.last_used) existing.last_used = log.start_at;
      } else {
        statsMap.set(log.tag_id, { entry_count: 1, last_used: log.start_at });
      }
    }

    return tags
      .map((tag) => {
        const stats = statsMap.get(tag.id);
        return {
          id: tag.id,
          name: tag.name,
          color: tag.color,
          icon: tag.icon,
          entry_count: stats?.entry_count ?? 0,
          last_used_at: stats?.last_used ?? null,
        };
      })
      .sort((a, b) => b.entry_count - a.entry_count);
  }
}
