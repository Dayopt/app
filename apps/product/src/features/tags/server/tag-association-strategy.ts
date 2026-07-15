import 'server-only';

import type { Database } from '@/lib/database';
import { databaseTables } from '@/lib/database';
import { createServiceRoleClient } from '@/lib/supabase/oauth';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TagDeleteStrategy } from '../types';
import { TagServiceError } from './tag-service-error';

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
    throw new TagServiceError(
      'FETCH_FAILED',
      `Failed to inspect tag associations: ${failed.error.message}`,
    );
  }
  return results.reduce((total, result) => total + (result.count ?? 0), 0);
}

/**
 * タグ削除時の関連 Plan / Record 処理（reassign / delete_blocks）を適用する
 */
export async function applyTagStrategy(options: {
  userId: string;
  tagIds: string[];
  strategy: TagDeleteStrategy;
  targetTagId?: string | undefined;
}): Promise<void> {
  const { userId, tagIds, strategy, targetTagId } = options;
  const adminClient = createServiceRoleClient();

  if (strategy === 'reassign') {
    if (!targetTagId) {
      throw new TagServiceError('INVALID_INPUT', 'targetTagId is required for reassign strategy');
    }
    for (const table of [databaseTables.plans, databaseTables.records] as const) {
      const { error } = await adminClient
        .from(table)
        .update({ tag_id: targetTagId })
        .in('tag_id', tagIds)
        .eq('user_id', userId);
      if (error) {
        throw new TagServiceError('UPDATE_FAILED', `Failed to reassign ${table}: ${error.message}`);
      }
    }
    return;
  }

  const { data: plans, error: planLookupError } = await adminClient
    .from('plans')
    .select('id')
    .in('tag_id', tagIds)
    .eq('user_id', userId);
  if (planLookupError) {
    throw new TagServiceError(
      'FETCH_FAILED',
      `Failed to inspect plans for tag deletion: ${planLookupError.message}`,
    );
  }

  const { error: recordDeleteError } = await adminClient
    .from(databaseTables.records)
    .delete()
    .in('tag_id', tagIds)
    .eq('user_id', userId);
  if (recordDeleteError) {
    throw new TagServiceError(
      'DELETE_FAILED',
      `Failed to delete records: ${recordDeleteError.message}`,
    );
  }

  const planIds = (plans ?? []).map((plan) => plan.id);
  if (planIds.length > 0) {
    const { error: detachError } = await adminClient
      .from(databaseTables.records)
      .update({ plan_id: null })
      .in('plan_id', planIds)
      .eq('user_id', userId);
    if (detachError) {
      throw new TagServiceError(
        'UPDATE_FAILED',
        `Failed to detach records from deleted plans: ${detachError.message}`,
      );
    }
  }

  const { error: planDeleteError } = await adminClient
    .from('plans')
    .delete()
    .in('tag_id', tagIds)
    .eq('user_id', userId);
  if (planDeleteError) {
    throw new TagServiceError(
      'DELETE_FAILED',
      `Failed to delete plans: ${planDeleteError.message}`,
    );
  }
}
