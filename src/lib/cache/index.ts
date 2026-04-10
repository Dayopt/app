/**
 * キャッシュユーティリティ
 *
 * Next.js 15の`unstable_cache()`を使用したサーバーサイドキャッシュ。
 * TanStack Queryのクライアントキャッシュと相互補完的に動作。
 *
 * @example
 * // Service層でキャッシュ付き取得
 * import { createCachedTagsFetcher } from '@/lib/cache';
 * const getCachedTags = createCachedTagsFetcher(supabase, userId);
 * const tags = await getCachedTags();
 *
 * // tRPCルーターでキャッシュ無効化
 * import { invalidateUserTagsCache } from '@/lib/cache';
 * await invalidateUserTagsCache(userId);
 */

// キャッシュユーティリティ
export { getUserTagsCacheTag } from './tag-cache';

// サーバーアクション（キャッシュ無効化）
export { invalidateUserTagsCache } from './actions';
