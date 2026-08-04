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
