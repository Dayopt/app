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
 * note / active tag name の部分一致を表す PostgREST filter を構築する。
 * tag ID は user-owned な active tag のクエリ結果だけを使用する。
 */
export async function buildTimeblockSearchFilter(
  options: BuildTimeblockSearchFilterOptions,
): Promise<string> {
  const sanitizedSearch = sanitizeTimeblockSearch(options.search);
  // 記号だけの入力で無条件一覧へフォールバックしない。idはNOT NULLなので必ず0件。
  if (sanitizedSearch.length === 0) return 'id.is.null';

  const { data: matchingTags, error } = await runPrivateTimeblockSearchQuery(() =>
    options.supabase
      .from(databaseTables.tags)
      .select('id')
      .eq('user_id', options.userId)
      .eq('is_active', true)
      .ilike('name', `%${sanitizedSearch}%`),
  );

  if (error) {
    // DB messageはfilter（検索語）を含み得るため、例外・Sentryへ連結しない。
    throw new TimeblockServiceError('FETCH_FAILED', 'Failed to search timeblock tags');
  }

  const filters = [`note.ilike.%${sanitizedSearch}%`];
  const matchingTagIds = (matchingTags ?? []).map((tag) => tag.id);

  if (matchingTagIds.length > 0) {
    filters.push(`tag_id.in.(${matchingTagIds.join(',')})`);
  }

  return filters.join(',');
}
