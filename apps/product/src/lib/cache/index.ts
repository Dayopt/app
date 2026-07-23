/**
 * キャッシュユーティリティ
 *
 * サーバーサイドキャッシュの無効化を担う。TanStack Queryの
 * クライアントキャッシュと相互補完的に動作する。
 *
 * @example
 * // tRPCルーターでキャッシュ無効化
 * import { invalidateUserTagsCache } from '@/lib/cache';
 * await invalidateUserTagsCache(ctx.userId);
 */

// キャッシュ無効化（server-only、Server Action ではない）
export { invalidateUserTagsCache } from './actions';
