/**
 * tRPC Router 初期化
 */

import 'server-only';

import { initTRPC } from '@trpc/server';
import superjson from 'superjson';

import { type ProductAccessLevel } from '@/lib/auth/domain';
import { getClientSafeServiceCode } from '@/lib/trpc/client-safe-service-code';
import type { Context } from '@/lib/trpc/context';

/**
 * プロシージャメタデータ（API仕様書自動生成用）
 */
interface ProcedureMeta {
  /** OpenAPI description */
  description?: string;
  /** 認証レベル */
  auth?: ProductAccessLevel;
  /** エンドポイント固有のレート制限（グローバル100 req/minを上書き） */
  rateLimit?: { requests: number; window: string };
  /** 非推奨フラグ */
  deprecated?: boolean;
}

export const t = initTRPC
  .context<Context>()
  .meta<ProcedureMeta>()
  .create({
    transformer: superjson,
    errorFormatter({ shape, error }) {
      const isProduction = process.env.NODE_ENV === 'production';

      // プロダクションではサーバー起因エラーの詳細を隠す（DB情報漏洩防止）
      const SERVER_ERROR_CODES = new Set([
        'INTERNAL_SERVER_ERROR',
        'TIMEOUT',
        'CLIENT_CLOSED_REQUEST',
      ]);
      const message =
        isProduction && SERVER_ERROR_CODES.has(error.code)
          ? 'サーバーエラーが発生した'
          : shape.message;

      return {
        ...shape,
        message,
        data: {
          ...shape.data,
          serviceCode: getClientSafeServiceCode(error.cause),
          // 開発環境でのみスタックトレースを含める
          stack: isProduction ? undefined : error.stack,
        },
      };
    },
  });

/**
 * ルーター作成関数
 */
export const createTRPCRouter = t.router;

/**
 * プロシージャのマージ関数
 */
export const mergeRouters = t.mergeRouters;

/**
 * テスト用callerファクトリ
 */
export const createCallerFactory = t.createCallerFactory;
