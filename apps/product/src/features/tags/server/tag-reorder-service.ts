import 'server-only';

import type { Database } from '@/lib/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createTagDatabaseError, TagServiceError } from './tag-service-error';

export interface ReorderTagUpdate {
  id: string;
  parent_id: string | null;
  sort_order: number;
}

export class TagReorderService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async reorder(options: {
    userId: string;
    updates: ReorderTagUpdate[];
  }): Promise<{ count: number }> {
    const { userId, updates } = options;
    if (updates.length === 0) return { count: 0 };

    const tagIds = updates.map((update) => update.id);
    const { data: existingTags, error: fetchError } = await this.supabase
      .from('tags')
      .select('id,parent_id')
      .eq('user_id', userId)
      .in('id', tagIds);
    if (fetchError) {
      throw createTagDatabaseError(
        fetchError,
        'FETCH_FAILED',
        'Failed to verify tags',
        'verify_reordered_tags',
      );
    }

    const existingIds = new Set(existingTags?.map((tag) => tag.id) ?? []);
    const invalidIds = tagIds.filter((id) => !existingIds.has(id));
    if (invalidIds.length > 0) {
      throw new TagServiceError('NOT_FOUND', `Tags not found: ${invalidIds.join(', ')}`);
    }

    const currentById = new Map(existingTags?.map((tag) => [tag.id, tag.parent_id ?? null]) ?? []);
    for (const update of updates) {
      if (update.parent_id === update.id) {
        throw new TagServiceError('INVALID_INPUT', 'A tag cannot be its own parent');
      }
      if (update.parent_id && currentById.get(update.parent_id) !== null) {
        throw new TagServiceError(
          'INVALID_INPUT',
          'Maximum nesting depth is 1 level. Parent tag cannot be a child of another tag.',
        );
      }
    }

    const { data: updatedCount, error: rpcError } = await this.supabase.rpc(
      'batch_reorder_tags_hierarchy',
      {
        p_user_id: userId,
        p_tag_ids: updates.map((update) => update.id),
        p_parent_ids: updates.map((update) => update.parent_id) as never,
        p_sort_orders: updates.map((update) => update.sort_order),
      },
    );
    if (rpcError) {
      throw createTagDatabaseError(
        rpcError,
        'UPDATE_FAILED',
        'Failed to reorder tags',
        'reorder_tags',
      );
    }
    return { count: typeof updatedCount === 'number' ? updatedCount : updates.length };
  }
}
