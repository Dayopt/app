import 'server-only';

import type { Database } from '@/lib/database';
import { captureUnexpectedDatabaseError } from '@/lib/sentry';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TimeblockServiceError } from './timeblock-service-error';

/**
 * アーカイブ済みアクティビティを新規 Plan / Record に付与させないガード
 *
 * アーカイブは「選択候補から隠す」状態なので、selector に出ないだけでなく
 * API 経由の付与も拒否する（#1576、旧 `assertTagAssignable` と同型）。
 * DB 側の `assert_active_timeblock_activity_v1` が権威（command 境界で FOR SHARE
 * ロック付きで検証する）で、こちらは UI 経路で往復する前に速く失敗させるための
 * 重複ガード。MCP 経路が意図的にこの事前検証を持たない設計（再送が誤って拒否
 * されるのを防ぐ）は旧 tag 側と同じ。存在・所有権の検証は既存の FK / DB trigger
 * に委ね、ここでは可視なアクティビティがアーカイブ済みの場合だけ弾く。
 *
 * エラーコードは `ACTIVITY_ARCHIVED`。DB は DT014 で表す（#2175 で tags を撤去し、
 * MCP 経路と同じ語彙へ統一した）。
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
    throw new TimeblockServiceError('ACTIVITY_ARCHIVED', 'Archived activities cannot be assigned');
  }
}
