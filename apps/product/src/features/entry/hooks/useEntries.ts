import { cacheStrategies } from '@/lib/tanstack-query/cache-config';
import { api } from '@/lib/trpc';
import type { EntryFilter } from '../schemas/entry';

/**
 * エントリ一覧取得フック（plans + records 統合）
 *
 * @description tRPC Query を使用してエントリ一覧を取得
 * @param filters - フィルター条件（origin, search, tagId, startDate, endDate, fulfillmentScore, sortBy, sortOrder, limit, offset）
 * @param options - React Query オプション
 *
 * @remarks
 * - staleTime: 30秒 → タブ切り替え時に30秒以上経過していれば自動再取得
 * - refetchOnWindowFocus: true（グローバル設定で有効）→ タブ切り替え時に再フェッチ
 * - gcTime: 10分 → メモリからの削除は遅らせてローディング状態を回避
 *
 * @see {@link cacheStrategies.entries} - activeCache設定を使用
 */
/** エントリ一覧を取得するフック（フィルター・ソート・ページネーション対応）
 * @param filters - フィルター条件（origin, search, tagId, 日付範囲など）
 * @param options - React Queryオプション（enabled など）
 */
export function useEntries(filters?: EntryFilter, options?: { enabled?: boolean }) {
  return api.entries.list.useQuery(filters, {
    ...cacheStrategies.entries, // staleTime: 30秒, gcTime: 10分
    retry: 1,
    ...options,
  });
}
