import 'server-only';

import type { Database } from '@/lib/database';
import { databaseTables } from '@/lib/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TagServiceError } from './tag-service-error';

export interface TagStatsRow {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  record_count: number;
  last_used_at: string | null;
}

export class TagStatisticsService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  /**
   * `records`（実績）を直接集計するタグ統計。
   *
   * `tags` は Layer 0 のため上位 feature の domain を import できない（feature DAG）。
   * 実績ベースの件数・最終使用日をここで独立に計算する。
   */
  async getStatsFromRecords(userId: string): Promise<TagStatsRow[]> {
    const { data: tags, error: tagsError } = await this.supabase
      .from('tags')
      .select('id, name, color, icon')
      .eq('user_id', userId)
      .eq('is_active', true);
    if (tagsError) {
      throw new TagServiceError('FETCH_FAILED', `Failed to fetch tags: ${tagsError.message}`);
    }
    if (!tags || tags.length === 0) return [];

    const { data: records, error: recordsError } = await this.supabase
      .from(databaseTables.records)
      .select('tag_id, start_at')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .not('tag_id', 'is', null);
    if (recordsError) {
      throw new TagServiceError('FETCH_FAILED', `Failed to fetch records: ${recordsError.message}`);
    }

    const statsMap = new Map<string, { record_count: number; last_used: string }>();
    for (const record of records ?? []) {
      if (!record.tag_id) continue;
      const existing = statsMap.get(record.tag_id);
      if (existing) {
        existing.record_count += 1;
        if (record.start_at > existing.last_used) existing.last_used = record.start_at;
      } else {
        statsMap.set(record.tag_id, { record_count: 1, last_used: record.start_at });
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
          record_count: stats?.record_count ?? 0,
          last_used_at: stats?.last_used ?? null,
        };
      })
      .sort((a, b) => b.record_count - a.record_count);
  }
}
