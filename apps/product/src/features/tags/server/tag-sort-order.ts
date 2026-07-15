import 'server-only';

import type { Database } from '@/lib/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TagServiceError } from './tag-service-error';

/**
 * 兄弟タグの末尾 sort_order + 1 を返す
 */
export async function getNextSortOrder(
  supabase: SupabaseClient<Database>,
  userId: string,
  parentId: string | null,
): Promise<number> {
  const query = supabase
    .from('tags')
    .select('sort_order')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (parentId) {
    query.eq('parent_id', parentId);
  } else {
    query.is('parent_id', null);
  }

  const { data, error } = await query.order('sort_order', { ascending: false }).limit(1);

  if (error) {
    throw new TagServiceError(
      'FETCH_FAILED',
      `Failed to resolve sibling sort order: ${error.message}`,
    );
  }

  const maxSortOrder = data?.[0]?.sort_order ?? -1;
  return maxSortOrder + 1;
}

/**
 * 兄弟タグの sort_order を全体 +1 して先頭（sort_order = 0）を空ける
 */
export async function makeRoomAtTop(
  supabase: SupabaseClient<Database>,
  userId: string,
  parentId: string | null,
): Promise<void> {
  const query = supabase
    .from('tags')
    .select('id, sort_order')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (parentId) {
    query.eq('parent_id', parentId);
  } else {
    query.is('parent_id', null);
  }

  const { data: siblings, error } = await query.order('sort_order', { ascending: true });

  if (error) {
    throw new TagServiceError(
      'FETCH_FAILED',
      `Failed to resolve sibling sort order: ${error.message}`,
    );
  }

  if (!siblings || siblings.length === 0) return;

  const { error: reorderError } = await supabase.rpc('batch_reorder_tags_hierarchy', {
    p_user_id: userId,
    p_tag_ids: siblings.map((tag) => tag.id),
    p_parent_ids: siblings.map(() => parentId) as never,
    p_sort_orders: siblings.map((tag) => tag.sort_order + 1),
  });

  if (reorderError) {
    throw new TagServiceError(
      'UPDATE_FAILED',
      `Failed to shift tag sort orders: ${reorderError.message}`,
    );
  }
}
