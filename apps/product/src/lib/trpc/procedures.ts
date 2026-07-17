/**
 * tRPCサーバー設定
 * プロシージャ定義とコンテキスト管理
 */

import 'server-only';

import { timingSafeEqual } from 'crypto';

import * as Sentry from '@sentry/nextjs';
import { SupabaseClient } from '@supabase/supabase-js';
import { initTRPC, TRPCError } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import superjson from 'superjson';

import { env } from '@/env';
import { canAccessProFeatures, type ProductAccessLevel } from '@/lib/auth/domain';
import { isBillingEnforced } from '@/lib/billing/enforcement';
import { logger } from '@/lib/logger';
import {
  captureUnexpectedDatabaseError,
  captureUnexpectedError,
  observeAuthOperation,
} from '@/lib/sentry';
// 循環依存防止: barrel `@/lib/mcp` は trpc-bridge を再 export し、それが appRouter →
// feature router → procedures.ts と辿るため、ここでは auth.ts を直 import する。
import { extractBearerToken, verifyAccessToken } from '@/lib/mcp/auth';
import { OAuthServerError, type OAuthClientId, type SupportedScope } from '@/lib/oauth-server';
import { trpcUserRateLimit } from '@/lib/rate-limit/upstash';
import { AuthMode, createServiceRoleClient, detectAuthMode } from '@/lib/supabase/oauth';
import { ServiceError } from '@/lib/trpc/errors';

import { databaseTables, type Database } from '@/lib/database';

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

/**
 * リクエストコンテキストの型定義
 */
export interface TrpcRequestLike {
  headers: Record<string, string | undefined>;
  cookies: Record<string, string | undefined>;
  socket?: {
    remoteAddress?: string | undefined;
  };
}

/** tRPCレスポンスの最低限のインターフェース */
export interface TrpcResponseLike {
  headers?: Headers;
  setHeader?: (name: string, value: string | readonly string[]) => void;
  end?: (...args: unknown[]) => void;
}

type MfaAssuranceLevel = 'aal1' | 'aal2';

/** tRPCプロシージャのコンテキスト型 */
export interface Context {
  req: TrpcRequestLike;
  res: TrpcResponseLike;
  userId?: string | undefined;
  sessionId?: string | undefined;
  supabase: SupabaseClient<Database>;
  /** 認証モード（session, oauth, service-role） */
  authMode: AuthMode;
  /** OAuth 2.1トークン（oauth modeの場合のみ） */
  accessToken?: string | undefined;
  /** OAuth 2.1 client_id（oauth modeの場合のみ） */
  oauthClientId?: OAuthClientId | undefined;
  /** 検証済み OAuth scopes（oauth modeの場合のみ） */
  oauthScopes?: SupportedScope[] | undefined;
  /** Supabase Auth MFA assurance level（session modeの場合のみ） */
  mfaAssurance?:
    | {
        currentLevel: MfaAssuranceLevel | null;
        nextLevel: MfaAssuranceLevel | null;
        lookupFailed?: boolean | undefined;
      }
    | undefined;
  /** JWTカスタムクレームから取得したサブスクリプション状態（custom_access_token hook） */
  subscriptionStatus?: string | undefined;
}

/**
 * コンテキスト作成関数
 *
 * 3つの認証モードをサポート：
 * 1. session: Cookie認証（既存、ブラウザ用）
 * 2. oauth: OAuth 2.1トークン認証（MCP用）
 * 3. service-role: Service Role Key認証（管理者用）
 */
async function createTRPCContext(opts: {
  req: TrpcRequestLike;
  res: TrpcResponseLike;
}): Promise<Context> {
  const { req, res } = opts;

  // リクエストヘッダーから認証モードを自動検出
  const authMode = detectAuthMode(req.headers as Record<string, string>);

  // 認証情報の取得
  let userId: string | undefined;
  let sessionId: string | undefined;
  let accessToken: string | undefined;
  let oauthClientId: OAuthClientId | undefined;
  let oauthScopes: SupportedScope[] | undefined;
  let mfaAssurance: Context['mfaAssurance'];
  let supabase: SupabaseClient<Database>;

  // 1. OAuth 2.1トークン認証（MCP用） — Dayopt 発行の opaque token を oauth_tokens 検証
  if (authMode === 'oauth') {
    try {
      const authHeader =
        typeof req.headers['authorization'] === 'string' ? req.headers['authorization'] : null;
      const token = extractBearerToken(authHeader);
      const verified = await verifyAccessToken(token);

      userId = verified.userId;
      accessToken = token;
      oauthClientId = verified.clientId;
      oauthScopes = verified.scopes;
      // Opaque token は JWT ではないため subscription_status は proProcedure 側で
      // 必ず DB lookup する (Decision 1)。supabase は service-role client。
      supabase = createServiceRoleClient();
    } catch (error) {
      if (error instanceof OAuthServerError) {
        if (error.httpStatus >= 500) {
          const original = error.cause instanceof Error ? error.cause : error;
          captureUnexpectedError(original, {
            feature: 'mcp',
            operation: 'create_trpc_oauth_context',
          });
          logger.error('OAuth token verification failed');
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'OAuth authentication service unavailable',
            cause: error,
          });
        }
        logger.warn('OAuth access token rejected');
      } else {
        const original =
          error instanceof Error ? error : new Error('Unexpected OAuth authentication failure');
        captureUnexpectedError(original, {
          feature: 'mcp',
          operation: 'create_trpc_oauth_context',
        });
        logger.error('OAuth token verification failed');
      }
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'OAuth authentication failed',
        cause: error,
      });
    }
  }
  // 2. Service Role認証（管理者用）
  else if (authMode === 'service-role') {
    try {
      const apiKey = typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'] : null;
      const expectedKey = env.SUPABASE_SERVICE_ROLE_KEY;

      if (!apiKey || !expectedKey || !safeCompare(apiKey, expectedKey)) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid or missing API key',
        });
      }

      // Service Role Client作成（RLSバイパス）
      supabase = createServiceRoleClient();
      userId = undefined; // Admin操作ではuserIdはundefined
    } catch (error) {
      logger.error('Service role authentication failed', { error });
      throw error;
    }
  }
  // 3. Session Cookie認証（既存、ブラウザ用）
  else {
    const { createServerClient } = await import('@supabase/ssr');

    supabase = createServerClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return Object.entries(req.cookies).map(([name, value]) => ({
              name,
              value: value ?? '',
            }));
          },
          setAll() {
            // tRPC API routes cannot set cookies (read-only context)
          },
        },
      },
    );

    try {
      // getUser()はSupabase Authサーバーに問い合わせてJWTを検証する（getSession()は署名未検証）
      const {
        data: { user },
      } = await observeAuthOperation('trpc_context_get_user', () => supabase.auth.getUser());

      if (user) {
        userId = user.id;
        // セッションからアクセストークンを取得（ログ・追跡用）
        try {
          const {
            data: { session },
          } = await observeAuthOperation('trpc_context_get_session', () =>
            supabase.auth.getSession(),
          );
          sessionId = session?.access_token;
        } catch {
          logger.warn('Session token lookup failed');
        }

        try {
          const { data: aalData, error: aalError } = await observeAuthOperation(
            'trpc_context_get_authenticator_assurance_level',
            () => supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
          );
          mfaAssurance = {
            currentLevel: normalizeMfaAssuranceLevel(aalData?.currentLevel),
            nextLevel: normalizeMfaAssuranceLevel(aalData?.nextLevel),
            lookupFailed: Boolean(aalError),
          };
          if (aalError) {
            logger.warn('MFA assurance lookup failed');
          }
        } catch {
          mfaAssurance = {
            currentLevel: null,
            nextLevel: null,
            lookupFailed: true,
          };
          logger.warn('MFA assurance lookup threw');
        }
      }
    } catch {
      // 認証エラーは無視（ゲストユーザーとして扱う）
    }
  }

  // JWTカスタムクレームからsubscription_statusを取得（custom_access_token hook）
  let subscriptionStatus: string | undefined;
  const tokenToDecode = accessToken ?? sessionId;
  if (tokenToDecode) {
    try {
      const payload = tokenToDecode.split('.')[1];
      if (payload) {
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<
          string,
          unknown
        >;
        subscriptionStatus =
          typeof claims['subscription_status'] === 'string'
            ? claims['subscription_status']
            : undefined;
      }
    } catch {
      // JWTデコード失敗時はundefined（proProcedureでフォールバック）
    }
  }

  return {
    req,
    res,
    userId,
    sessionId,
    accessToken,
    oauthClientId,
    oauthScopes,
    mfaAssurance,
    supabase,
    authMode,
    subscriptionStatus,
  };
}

/** Fetch API用tRPCコンテキスト作成（App Router Route Handler向け） */
export async function createFetchTRPCContext(opts: FetchCreateContextFnOptions): Promise<Context> {
  return createTRPCContext({
    req: createRequestLike(opts.req),
    res: { headers: opts.resHeaders },
  });
}

/**
 * tRPCインスタンス初期化
 */
const t = initTRPC
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
          // 開発環境でのみスタックトレースを含める
          stack: isProduction ? undefined : error.stack,
        },
      };
    },
  });

/**
 * per-userId レート制限（100 req/min）
 *
 * Upstash 有効時は Redis ベース（分散環境対応）、
 * 未設定時はインメモリフォールバック。
 *
 * ⚠️ インメモリフォールバックの制約:
 * Vercel Serverless 環境ではインスタンスごとに状態が分離され、
 * コールドスタートでリセットされるため実質的に制限が効かない。
 * 本番環境では必ず Upstash Redis を設定すること。
 */
const USER_RATE_LIMIT = 100;
const USER_RATE_WINDOW_MS = 60 * 1000;
const userRequestLog = new Map<string, number[]>();

const OAUTH_TRPC_SCOPE_REQUIREMENTS: Partial<Record<string, SupportedScope>> = {
  'plans.list': 'read:entries',
  'records.list': 'read:entries',
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
      const requiredScope = OAUTH_TRPC_SCOPE_REQUIREMENTS[path];
      if (!requiredScope || !ctx.oauthScopes?.includes(requiredScope)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'OAuth token scope does not allow this procedure',
          cause: new ServiceError('FORBIDDEN', 'OAuth scope denied'),
        });
      }
    }

    if (ctx.authMode === 'session') {
      if (ctx.mfaAssurance?.lookupFailed) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'MFA verification required',
          cause: new ServiceError('FORBIDDEN', 'MFA AAL lookup failed'),
        });
      }

      if (
        !MFA_CHALLENGE_TRPC_PATHS.has(path) &&
        ctx.mfaAssurance?.currentLevel === 'aal1' &&
        ctx.mfaAssurance.nextLevel === 'aal2'
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'MFA verification required',
          cause: new ServiceError('FORBIDDEN', 'MFA AAL2 required'),
        });
      }
    }

    // per-userId レート制限
    if (await isUserRateLimited(userId)) {
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
export const createTRPCRouter = t.router;

/**
 * プロシージャのマージ関数
 */
export const mergeRouters = t.mergeRouters;

/**
 * テスト用callerファクトリ
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * タイミング攻撃耐性のある文字列比較
 */
function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

function createRequestLike(req: Request): TrpcRequestLike {
  const headers = Object.fromEntries(
    Array.from(req.headers.entries(), ([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    headers,
    cookies: parseCookieHeader(req.headers.get('cookie')),
  };
}

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};

  const cookies: Record<string, string> = {};

  for (const cookie of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = cookie.trim().split('=');
    if (!rawName) continue;

    const value = rawValue.join('=') || '';

    try {
      cookies[rawName] = decodeURIComponent(value);
    } catch {
      cookies[rawName] = value;
    }
  }

  return cookies;
}

function normalizeMfaAssuranceLevel(level: unknown): MfaAssuranceLevel | null {
  return level === 'aal1' || level === 'aal2' ? level : null;
}
