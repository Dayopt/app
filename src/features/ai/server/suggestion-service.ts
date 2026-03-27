/**
 * Suggestions Service
 *
 * 最近のエントリからタイトル+タグのサジェストを提供するサービス層
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

import { ServiceError } from '@/platform/trpc/errors';

type ServiceSupabaseClient = SupabaseClient<Database>;

interface RecentTitlesOptions {
  userId: string;
  search?: string | undefined;
  limit?: number | undefined;
  /** 'planned' のみ or 'actual' のみに絞り込む。省略時は両方取得 */
  type?: 'planned' | 'actual' | undefined;
}

interface RecentEntry {
  title: string;
  tagIds: string[];
  source: 'planned' | 'actual';
  lastUsedAt: string;
  count: number;
}

/** サジェストサービス固有のエラークラス */
export class SuggestionServiceError extends ServiceError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'SuggestionServiceError';
  }
}

/** 最近のエントリからタイトル+タグのサジェストを提供するサービスクラス */
export class SuggestionService {
  constructor(private readonly supabase: ServiceSupabaseClient) {}

  /**
   * 最近のユニークなタイトル+タグ組み合わせを取得
   *
   * entries テーブルから origin で planned/actual を区別して取得し、
   * タイトルでグループ化して使用頻度と最新日時でソートする
   */
  async recentTitles(options: RecentTitlesOptions): Promise<RecentEntry[]> {
    const { userId, search, limit = 20, type } = options;

    let query = this.supabase
      .from('entries')
      .select('title, created_at, origin, entry_tags(tag_id)')
      .eq('user_id', userId)
      .not('title', 'eq', '')
      .order('created_at', { ascending: false })
      .limit(100);

    // type フィルター: origin で絞り込み
    if (type === 'planned') {
      query = query.eq('origin', 'planned');
    } else if (type === 'actual') {
      query = query.eq('origin', 'planned');
    }

    if (search) {
      const sanitized = search.replace(/[%_]/g, '');
      query = query.ilike('title', `%${sanitized}%`);
    }

    const { data: entriesData, error } = await query;

    if (error) {
      throw new SuggestionServiceError('FETCH_FAILED', error.message);
    }

    // タイトルでグループ化
    const titleMap = new Map<
      string,
      {
        tagIds: string[];
        source: 'planned' | 'actual';
        lastUsedAt: string;
        count: number;
      }
    >();

    for (const entry of entriesData ?? []) {
      if (!entry.title || !entry.created_at) continue;
      const existing = titleMap.get(entry.title);
      const tagIds = ((entry.entry_tags as unknown as { tag_id: string }[]) ?? []).map(
        (t) => t.tag_id,
      );
      const createdAt = entry.created_at;
      const source: 'planned' | 'actual' = entry.origin === 'planned' ? 'planned' : 'actual';

      if (existing) {
        existing.count += 1;
        if (createdAt > existing.lastUsedAt) {
          existing.lastUsedAt = createdAt;
          existing.tagIds = tagIds;
          existing.source = source;
        }
      } else {
        titleMap.set(entry.title, {
          tagIds,
          source,
          lastUsedAt: createdAt,
          count: 1,
        });
      }
    }

    // ソート: 最新日時降順
    const entries: RecentEntry[] = Array.from(titleMap.entries())
      .map(([title, data]) => ({ title, ...data }))
      .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
      .slice(0, limit);

    return entries;
  }
}

/** SuggestionService のファクトリ関数 */
export function createSuggestionService(supabase: ServiceSupabaseClient): SuggestionService {
  return new SuggestionService(supabase);
}
