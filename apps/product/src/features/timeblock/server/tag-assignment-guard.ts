import 'server-only';

import type { Database } from '@/lib/database';
import { captureUnexpectedDatabaseError } from '@/lib/sentry';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TimeblockServiceError } from './timeblock-service-error';

/**
 * アーカイブ済みタグを新規 Plan / Record に付与させないガード
 *
 * アーカイブは「選択候補から隠す」状態なので、selector に出ないだけでなく
 * API 経由の付与も拒否する（#1576）。タグの存在・所有権の検証は既存の
 * FK / DB trigger に委ね、ここでは可視なタグがアーカイブ済みの場合だけ弾く。
 */
export async function assertTagAssignable(
  supabase: SupabaseClient<Database>,
  userId: string,
  tagId: string | null | undefined,
): Promise<void> {
  if (!tagId) return;

  const { data, error } = await supabase
    .from('tags')
    .select('archived_at')
    .eq('id', tagId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    const original = captureUnexpectedDatabaseError(error, {
      feature: 'timeblock',
      operation: 'assert_tag_assignable',
    });
    throw new TimeblockServiceError('FETCH_FAILED', 'Failed to inspect tag', { cause: original });
  }

  if (data?.archived_at) {
    throw new TimeblockServiceError('TAG_ARCHIVED', 'Archived tags cannot be assigned');
  }
}

/**
 * アーカイブ済みアクティビティを新規 Plan / Record に付与させないガード
 *
 * `assertTagAssignable` と同型。DB 側の `assert_active_timeblock_activity_v1` が
 * 権威（command 境界で FOR SHARE ロック付きで検証する）で、こちらは UI 経路で
 * 往復する前に速く失敗させるための重複ガード。MCP 経路が意図的にこの事前検証を
 * 持たない設計（再送が誤って拒否されるのを防ぐ）は tag 側と同じ。
 *
 * エラーコードは `TAG_ARCHIVED` を流用する。DB は tag / activity のどちらも
 * DT014 で表し区別しないため、ここだけ新コードを足すと層ごとに粒度が食い違う。
 * 語彙の付け替えは tags 撤去（Step 7）でまとめて行う。
 */
export async function assertActivityAssignable(
  supabase: SupabaseClient<Database>,
  userId: string,
  activityId: string | null | undefined,
): Promise<void> {
  if (!activityId) return;

  const { data, error } = await supabase
    .from('activities')
    .select('archived_at')
    .eq('id', activityId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    const original = captureUnexpectedDatabaseError(error, {
      feature: 'timeblock',
      operation: 'assert_activity_assignable',
    });
    throw new TimeblockServiceError('FETCH_FAILED', 'Failed to inspect activity', {
      cause: original,
    });
  }

  if (data?.archived_at) {
    throw new TimeblockServiceError('TAG_ARCHIVED', 'Archived activities cannot be assigned');
  }
}
