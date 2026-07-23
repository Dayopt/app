import 'server-only';

import { revalidateTag } from 'next/cache';

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
 * ユーザーのタグキャッシュを無効化
 *
 * タグのmutation（create/update/delete/merge/reorder）後に呼び出す。
 * これにより次のリクエストで最新データがDBから取得される。
 *
 * この module は `'use server'` を付けない（server-only に固定する）。
 * userId を境界内で検証せず呼び出し元から受け取るため、Server Action として
 * 公開すると action ID の露出（GHSA-955p-x3mx-jcvp）経由で未認証呼び出しから
 * 任意ユーザーのキャッシュを無効化できてしまう。呼び出し元は tRPC の
 * protectedProcedure のみで client 経路は無いため、公開する必要が無い。
 *
 * @param userId - 認証済みユーザーのID（tRPC の `ctx.userId` を渡すこと）
 *
 * @example
 * // tRPCルーターで使用
 * await service.create({ ... });
 * await invalidateUserTagsCache(ctx.userId);
 */
export async function invalidateUserTagsCache(userId: string): Promise<void> {
  safeRevalidateTag(getUserTagsCacheTag(userId));
}
