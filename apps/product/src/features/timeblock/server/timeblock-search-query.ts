import 'server-only';

import { databaseTables } from '@/lib/database';

import { runPrivateTimeblockSearchQuery } from './private-timeblock-search-query';
import { TimeblockServiceError } from './timeblock-service-error';
import type { ServiceSupabaseClient } from './types';

const POSTGREST_FILTER_SPECIAL_CHARACTERS = /[.,()\\%*:_]/g;

interface BuildTimeblockSearchFilterOptions {
  supabase: ServiceSupabaseClient;
  userId: string;
  search: string;
}

/**
 * PostgREST の `.or()` filter に埋め込めない記号を除去する。
 *
 * `.or()` は filter string をそのまま解釈するため、ユーザー入力を直接渡さない。
 */
function sanitizeTimeblockSearch(search: string): string {
  return search.replace(POSTGREST_FILTER_SPECIAL_CHARACTERS, '').trim();
}

/**
 * note / 分類名（アクティビティ・タグ）の部分一致を表す PostgREST filter を構築する。
 *
 * **アクティビティとタグの和集合で引く。** #2162 の cutover 後に作られたブロックは
 * `activity_id` を持ち `tag_id` を持たないが、cutover 前の旧ブロックは逆になる。
 * どちらか一方だけを見ると、もう一方の世代が検索から丸ごと消える。
 * tags 経路は Step 7（#2176）の tags 撤去まで残す。
 *
 * ID は user-owned かつ現役の行のクエリ結果だけを使用する。
 */
export async function buildTimeblockSearchFilter(
  options: BuildTimeblockSearchFilterOptions,
): Promise<string> {
  const sanitizedSearch = sanitizeTimeblockSearch(options.search);
  // 記号だけの入力で無条件一覧へフォールバックしない。idはNOT NULLなので必ず0件。
  if (sanitizedSearch.length === 0) return 'id.is.null';

  const [activitiesResult, tagsResult] = await Promise.all([
    runPrivateTimeblockSearchQuery(() =>
      options.supabase
        .from(databaseTables.activities)
        .select('id')
        .eq('user_id', options.userId)
        .is('archived_at', null)
        .ilike('name', `%${sanitizedSearch}%`),
    ),
    runPrivateTimeblockSearchQuery(() =>
      options.supabase
        .from(databaseTables.tags)
        .select('id')
        .eq('user_id', options.userId)
        .eq('is_active', true)
        .ilike('name', `%${sanitizedSearch}%`),
    ),
  ]);

  if (activitiesResult.error || tagsResult.error) {
    // DB messageはfilter（検索語）を含み得るため、例外・Sentryへ連結しない。
    throw new TimeblockServiceError('FETCH_FAILED', 'Failed to search timeblock classifications');
  }

  const filters = [`note.ilike.%${sanitizedSearch}%`];

  const matchingActivityIds = (activitiesResult.data ?? []).map((activity) => activity.id);
  if (matchingActivityIds.length > 0) {
    filters.push(`activity_id.in.(${matchingActivityIds.join(',')})`);
  }

  const matchingTagIds = (tagsResult.data ?? []).map((tag) => tag.id);
  if (matchingTagIds.length > 0) {
    filters.push(`tag_id.in.(${matchingTagIds.join(',')})`);
  }

  return filters.join(',');
}
