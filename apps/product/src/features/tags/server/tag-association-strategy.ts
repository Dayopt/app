import 'server-only';

import type { Database } from '@/lib/database';
import { databaseTables } from '@/lib/database';
import { createServiceRoleClient } from '@/lib/supabase/oauth';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TagDeleteStrategy } from '../types';
import { createTagDatabaseError, TagServiceError } from './tag-service-error';

/**
 * タグに紐づく Plan / Record の総数を数える
 */
export async function countTagAssociations(
  supabase: SupabaseClient<Database>,
  userId: string,
  tagIds: string[],
): Promise<number> {
  const results = await Promise.all(
    ([databaseTables.plans, databaseTables.records] as const).map((table) =>
      supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .in('tag_id', tagIds)
        .eq('user_id', userId),
    ),
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw createTagDatabaseError(
      failed.error,
      'FETCH_FAILED',
      'Failed to inspect tag associations',
      'count_tag_associations',
    );
  }
  return results.reduce((total, result) => total + (result.count ?? 0), 0);
}

/**
 * 関連 Plan / Record 処理とタグ削除を同じDB transactionで適用する
 */
export async function deleteTagsWithStrategy(options: {
  userId: string;
  tagIds: string[];
  strategy: TagDeleteStrategy | 'require_empty';
  targetTagId?: string | undefined;
  promoteChildren: boolean;
}): Promise<number> {
  const { userId, tagIds, strategy, targetTagId, promoteChildren } = options;
  const adminClient = createServiceRoleClient();
  const { data: deletedCount, error } = await adminClient.rpc(
    'delete_tags_with_timeblocks_command_v3',
    {
      p_promote_children: promoteChildren,
      p_strategy: strategy,
      p_tag_ids: tagIds,
      p_target_tag_id: (targetTagId ?? null) as never,
      p_user_id: userId,
    },
  );

  if (error || deletedCount === null) {
    if (error !== null && typeof error === 'object' && 'code' in error && error.code === 'DT014') {
      throw new TagServiceError(
        'INVALID_INPUT',
        'Tag has associated blocks. Specify a deletion strategy.',
      );
    }
    throw createTagDatabaseError(
      error ?? { message: 'Tag deletion command returned no result' },
      'DELETE_FAILED',
      'Failed to delete tags and associated blocks',
      'delete_tags_with_timeblocks',
    );
  }

  return deletedCount;
}
