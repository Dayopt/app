'use server';

import { revalidatePath, revalidateTag } from 'next/cache';

import { getUserTagsCacheTag } from './tag-cache';

/**
 * Next.js revalidateTagを安全に呼び出す
 *
 * tRPCルーター内など、Next.jsのリクエストコンテキスト外から呼ばれた場合は
 * エラーを無視する。クライアント側のTanStack Query invalidateが
 * UIの更新を担保するため、サーバーサイドキャッシュの無効化失敗は許容できる。
 */
function safeRevalidateTag(tag: string): void {
  try {
    revalidateTag(tag, 'max');
  } catch {
    // Next.js 15ではtRPCルーター内からの呼び出しで
    // "static generation store missing" エラーが発生する場合がある
    // クライアント側のinvalidateで同期されるため、ここでは無視
  }
}

/**
 * Next.js revalidatePathを安全に呼び出す
 *
 * Router Cache（staleTimes.dynamic: 30s）を含むサーバーサイドキャッシュを
 * パス単位で無効化する。revalidateTagと同様にtRPCコンテキストでの
 * エラーを安全に無視する。
 */
function safeRevalidatePath(path: string, type?: 'layout' | 'page'): void {
  try {
    revalidatePath(path, type);
  } catch {
    // tRPCコンテキストからの呼び出し時は無視
  }
}

/**
 * ユーザーのタグキャッシュを無効化
 *
 * タグのmutation（create/update/delete/merge/reorder）後に呼び出す。
 * これにより次のリクエストで最新データがDBから取得される。
 *
 * @param userId - ユーザーID
 *
 * @example
 * // tRPCルーターで使用
 * await service.create({ ... });
 * await invalidateUserTagsCache(ctx.userId!);
 */
export async function invalidateUserTagsCache(userId: string): Promise<void> {
  safeRevalidateTag(getUserTagsCacheTag(userId));
}

/**
 * カレンダー・Stats関連ページのRouter Cacheを無効化
 *
 * エントリの作成/更新/削除後に呼び出すことで、
 * next.config.mjsのstaleTimes.dynamic（30s）による
 * stale Router Cacheを即座にクリアする。
 *
 * @example
 * // tRPCルーターで使用
 * await service.createEntry({ ... });
 * await invalidateCalendarCache();
 */
export async function invalidateCalendarCache(): Promise<void> {
  // layoutレベルで無効化し、配下の全ページ（day/week/[nday]/stats）を一括クリア
  safeRevalidatePath('/[locale]/(app)', 'layout');
}
