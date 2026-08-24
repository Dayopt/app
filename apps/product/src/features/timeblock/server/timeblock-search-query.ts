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
 * note / アクティビティ名の部分一致を表す PostgREST filter を構築する。
 *
 * tags 名前検索は Step 8（tag_id 剥離）で除去した。書き込み経路が tag_id を
 * 受け付けなくなり、note に含まれない旧タグ名でのヒットは以後発生しない
 * （唯一のユーザー可視劣化。docs/projects/tag-model-replacement/overview.md
 * §Step 8（tag_id 剥離）の設計 参照）。
 *
 * ID は user-owned かつ現役の行のクエリ結果だけを使用する。
 */
export async function buildTimeblockSearchFilter(
  options: BuildTimeblockSearchFilterOptions,
): Promise<string> {
  const sanitizedSearch = sanitizeTimeblockSearch(options.search);
  // 記号だけの入力で無条件一覧へフォールバックしない。idはNOT NULLなので必ず0件。
  if (sanitizedSearch.length === 0) return 'id.is.null';

  const activitiesResult = await runPrivateTimeblockSearchQuery(() =>
    options.supabase
      .from(databaseTables.activities)
      .select('id')
      .eq('user_id', options.userId)
      .is('archived_at', null)
      .ilike('name', `%${sanitizedSearch}%`),
  );

  if (activitiesResult.error) {
    // DB messageはfilter（検索語）を含み得るため、例外・Sentryへ連結しない。
    throw new TimeblockServiceError('FETCH_FAILED', 'Failed to search timeblock classifications');
  }

  const filters = [`note.ilike.%${sanitizedSearch}%`];

  const matchingActivityIds = (activitiesResult.data ?? []).map((activity) => activity.id);
  if (matchingActivityIds.length > 0) {
    filters.push(`activity_id.in.(${matchingActivityIds.join(',')})`);
  }

  return filters.join(',');
}
