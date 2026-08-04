/**
 * tRPCサーバー設定
 * プロシージャ定義とコンテキスト管理
 */

import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { TRPCError } from '@trpc/server';

import { canAccessProFeatures } from '@/lib/auth/domain';
import { isBillingEnforced } from '@/lib/billing/enforcement';
import { databaseTables } from '@/lib/database';
import { type SupportedScope } from '@/lib/oauth-server';
import { trpcUserRateLimit } from '@/lib/rate-limit/upstash';
import { captureUnexpectedDatabaseError, captureUnexpectedError } from '@/lib/sentry';
import { ServiceError } from '@/lib/trpc/errors';
import { createCallerFactory, createTRPCRouter, mergeRouters, t } from '@/lib/trpc/router';
import { isValidMfaAssuranceTransition } from '@/lib/trpc/session-auth-context';
export type { Context } from '@/lib/trpc/context';
const USER_RATE_LIMIT = 100;
const USER_RATE_WINDOW_MS = 60 * 1000;
const userRequestLog = new Map<string, number[]>();

const MCP_TRPC_SCOPE_REQUIREMENTS: Partial<Record<string, SupportedScope>> = {
  'plans.list': 'read:entries',
  'plans.getById': 'read:entries',
  'records.list': 'read:entries',
  'records.getById': 'read:entries',
  'statistics.getMcpReview': 'read:stats',
  'tags.list': 'read:tags',
  // 過去の Plan / Record が保持するアーカイブ済み tagId を名前へ解決するため、
  // tags.list tool が includeArchived で呼ぶ。read:tags の読み取り範囲に収まる。
  'tags.listArchived': 'read:tags',
  'timeblockContext.getConstraints': 'read:constraints',
};

const MFA_CHALLENGE_TRPC_PATHS = new Set(['user.verifyRecoveryCode']);

function isUserRateLimitedInMemory(userId: string): boolean {
  const now = Date.now();
  const timestamps = userRequestLog.get(userId) ?? [];
  const recent = timestamps.filter((t) => now - t < USER_RATE_WINDOW_MS);
  recent.push(now);
  userRequestLog.set(userId, recent);

  // メモリリーク防止
  if (userRequestLog.size > 10000) {
    for (const [key, ts] of userRequestLog) {
      if (ts.every((t) => now - t > USER_RATE_WINDOW_MS)) {
        userRequestLog.delete(key);
      }
    }
  }

  return recent.length > USER_RATE_LIMIT;
}

async function isUserRateLimited(userId: string): Promise<boolean> {
  // Upstash が有効な場合は Redis ベースのレート制限を使用
  if (trpcUserRateLimit) {
    try {
      const { success } = await trpcUserRateLimit.limit(userId);
      return !success;
    } catch (error) {
      // Redis エラー時はインメモリにフォールバック（可用性優先）
      const original = error instanceof Error ? error : new Error('tRPC rate limit check failed');
      captureUnexpectedError(original, {
        feature: 'rate_limit',
        operation: 'trpc_user_rate_limit_check',
        source: 'upstash',
      });
      return isUserRateLimitedInMemory(userId);
    }
  }
  // Upstash 未設定時はインメモリ実装
  return isUserRateLimitedInMemory(userId);
}

/**
 * 認証が必要なプロシージャ
 */
export const protectedProcedure = t.procedure
  .meta({ auth: 'protected' })
  .use(async ({ ctx, next, path }) => {
    if (!ctx.userId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
        cause: new ServiceError('INVALID_TOKEN', 'Authentication required'),
      });
    }
    const userId = ctx.userId;

    if (ctx.authMode === 'oauth') {
      if (ctx.oauthExecution !== 'mcp_internal') {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'OAuth tokens are accepted only through the MCP endpoint',
          cause: new ServiceError('FORBIDDEN', 'Public OAuth tRPC access denied'),
        });
      }
      const requiredScope = MCP_TRPC_SCOPE_REQUIREMENTS[path];
      if (!requiredScope || !ctx.oauthScopes?.includes(requiredScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'OAuth token scope does not allow this procedure',
          cause: new ServiceError('FORBIDDEN', 'OAuth scope denied'),
        });
      }
    }

    if (ctx.authMode === 'session') {
      const mfaAssurance = ctx.mfaAssurance;
      if (
        !mfaAssurance ||
        mfaAssurance.lookupFailed ||
        !isValidMfaAssuranceTransition(mfaAssurance.currentLevel, mfaAssurance.nextLevel)
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'MFA verification required',
          cause: new ServiceError('FORBIDDEN', 'MFA AAL lookup failed'),
        });
      }

      if (
        !MFA_CHALLENGE_TRPC_PATHS.has(path) &&
        mfaAssurance.currentLevel === 'aal1' &&
        mfaAssurance.nextLevel === 'aal2'
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'MFA verification required',
          cause: new ServiceError('FORBIDDEN', 'MFA AAL2 required'),
        });
      }
    }

    // OAuth internal callerは認証済みMCP endpointの専用user limiterで一度だけ制限する。
    // ここでも消費するとentries.listが二重課金され、UI sessionともbucketが干渉する。
    if (ctx.authMode !== 'oauth' && (await isUserRateLimited(userId))) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests. Please try again later.',
      });
    }

    // Request-localなscopeに内部IDだけを設定し、並行requestへ漏らさない。
    return Sentry.withIsolationScope(async (scope) => {
      scope.setUser({ id: userId });
      return next({
        ctx: {
          ...ctx,
          userId,
        },
      });
    });
  });

/**
 * Pro プラン以上が必要なプロシージャ
 *
 * - session 認証時: JWTカスタムクレーム（custom_access_token hook）→ DB fallback
 * - oauth 認証時: 必ず DB lookup (opaque token は JWT claim を持たないため)。
 *   毎リクエスト DB を引くことで、Pro 解約直後の暴露窓を access_token TTL = 5min に抑える
 *   (docs/projects/mcp-server/overview.md Decision 1)
 *
 * past_due: Stripe dunning（回収リトライ）期間中はアクセス維持。
 */
export const proProcedure = protectedProcedure.meta({ auth: 'pro' }).use(async ({ ctx, next }) => {
  // 課金 enforcement が無効（既定）の間は Pro ゲートを素通りさせ、全機能を無料提供する。
  // proProcedure 注釈は将来の課金対象マーカーとして温存する（Phase B でフラグを 'true' に）。
  if (!isBillingEnforced()) {
    return next({ ctx });
  }

  // OAuth 経路は claim cache を信用せず、毎リクエスト DB lookup を強制する
  let status = ctx.authMode === 'oauth' ? undefined : ctx.subscriptionStatus;

  if (!status) {
    const { data, error } = await ctx.supabase
      .from(databaseTables.profiles)
      .select('*')
      .eq('id', ctx.userId)
      .single();

    if (error) {
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'billing',
        operation: 'check_pro_subscription',
      });
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to verify subscription status',
        cause: original,
      });
    }

    status = (data as Record<string, unknown> | null)?.subscription_status as string | undefined;
  }

  const isProActive = canAccessProFeatures(status);

  if (!isProActive) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Pro plan required',
      cause: new ServiceError('FORBIDDEN', 'Pro subscription required'),
    });
  }

  return next({ ctx });
});

/**
 * ルーター作成関数
 */
export { createCallerFactory, createTRPCRouter, mergeRouters };
