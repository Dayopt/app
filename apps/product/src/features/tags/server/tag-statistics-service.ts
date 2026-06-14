import 'server-only';

import type { Database } from '@dayopt/database';
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
}
