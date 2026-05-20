/**
 * tRPC設定とクライアント初期化（App Router用）
 * 型安全なAPI通信の基盤
 *
 * @note サーバー専用のhelpers（createServerHelpers等）は
 *       '@/lib/trpc/server' から直接インポートしてください
 */

import type { AppRouter } from '@/lib/trpc/root';
import { createTRPCReact } from '@trpc/react-query';

/**
 * React hooks用のtRPCクライアント（App Router推奨）
 */
export const api = createTRPCReact<AppRouter>();

/**
 * APIの型定義をエクスポート
 */
export type { AppRouter } from '@/lib/trpc/root';

/**
 * SSR/CSR共通のベースURL取得関数
 */
export { getBaseUrl } from '@/lib/trpc/client';
