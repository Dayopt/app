import { cacheStrategies } from '@/lib/tanstack-query/cache-config';
import { api } from '@/lib/trpc';

/**
 * 単一エントリ取得フック
 * @description tRPC Query を使用してエントリを ID で取得
 * @param id - エントリID
 * @param options - オプション（tags: true でタグも取得）
 *
 * @remarks
 * - staleTime: 30秒 → 30秒以内のタブ切り替えでは再フェッチをスキップ（UX向上）
 * - refetchOnWindowFocus: true（グローバル設定で有効）→ staleなデータのみ再フェッチ
 * - gcTime: 10分 → メモリからの削除は遅らせてローディング状態を回避
 * - placeholderData: entries.list キャッシュから即座にデータを表示（UX大幅向上）
 *
 * @see {@link cacheStrategies.plans} - activeCache設定を使用
 */
/** 単一エントリをIDで取得するフック（タグ情報含む・キャッシュからプレースホルダー表示）
 * @param id - エントリID
 * @param options - includeTags: タグ情報を含む, enabled: クエリ有効化フラグ
 */
export function useEntry(id: string, options?: { includeTags?: boolean; enabled?: boolean }) {
  const utils = api.useUtils();

  return api.entries.getById.useQuery(
    {
      id,
      include: options?.includeTags ? { tags: true } : undefined,
    },
    {
      ...cacheStrategies.plans, // staleTime: 30秒, gcTime: 10分
      retry: 1,
      enabled: options?.enabled ?? true,
      // plans.list キャッシュからプレースホルダーデータを即座に表示
      // これによりローディング状態をスキップし、UXが大幅に向上
      placeholderData: () => {
        // 全ての plans.list キャッシュを検索してプランを見つける
        const listData = utils.entries.list.getData();
        if (listData) {
          const found = listData.find((p) => p.id === id);
          if (found) {
            // plans.list の型を getById の戻り型に合わせる
            return found as ReturnType<typeof utils.entries.getById.getData>;
          }
        }
        return undefined;
      },
    },
  );
}
