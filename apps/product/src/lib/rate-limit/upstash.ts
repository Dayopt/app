/**
 * Upstash Redis レート制限実装
 *
 * Phase 3: 本番環境向けの永続的レート制限
 * インメモリ実装の制限（再起動でリセット）を解決
 *
 * @see https://upstash.com/docs/redis/features/ratelimiting
 * @see Issue #487 - OWASP準拠のセキュリティ強化 Phase 3
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

import { env } from '@/env';
import { logger } from '@/lib/logger';
import { extractClientIp } from '@/lib/security/ip-validation';
import { captureUnexpectedError } from '@/lib/sentry';

const UPSTASH_REDIS_REST_URL = env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = env.UPSTASH_REDIS_REST_TOKEN;

/** Upstash Redisが有効かどうか（環境変数が設定されている場合のみtrue） */
export const isUpstashEnabled = Boolean(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);
const isProductionBuild = process.env.NEXT_PHASE === 'phase-production-build';

/**
 * Redis接続（環境変数が設定されている場合のみ）
 */
let redis: Redis | null = null;

if (isUpstashEnabled) {
  redis = new Redis({
    url: UPSTASH_REDIS_REST_URL!,
    token: UPSTASH_REDIS_REST_TOKEN!,
  });
} else if (!isProductionBuild) {
  // Production runtimeはenv validation、Production buildはapp-local build gateが不足を拒否する。
  logger.warn(
    '[RateLimit] Upstash is not configured. Falling back to in-memory rate limiting — single-instance only, breaks on multi-replica deployments.',
  );
}

export const RATE_LIMIT_TIMEOUT_MS = 2_000;

type RatelimitResponse = Awaited<ReturnType<Ratelimit['limit']>>;

interface ProductRateLimiter {
  limit(identifier: string): Promise<RatelimitResponse>;
}

export class RateLimitUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Rate-limit backend is unavailable', cause === undefined ? undefined : { cause });
    this.name = 'RateLimitUnavailableError';
  }
}

/** Upstash SDK timeoutはsuccess=trueを返すため、明示的にbackend unavailableへ変換する。 */
export function requireAvailableRateLimitResult(result: RatelimitResponse): RatelimitResponse {
  if (result.reason === 'timeout') throw new RateLimitUnavailableError();
  return result;
}

/** Upstash keyにはraw IP、user ID、tokenを残さず、namespace prefix付きSHA-256だけを渡す。 */
export async function hashRateLimitIdentifier(identifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`dayopt-product:${identifier}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createRateLimiter(
  limiter: ReturnType<typeof Ratelimit.slidingWindow>,
  prefix: string,
): ProductRateLimiter | null {
  if (!redis) return null;

  const rateLimit = new Ratelimit({
    redis,
    limiter,
    analytics: false,
    prefix,
    timeout: RATE_LIMIT_TIMEOUT_MS,
  });

  return {
    limit: async (identifier) =>
      requireAvailableRateLimitResult(
        await rateLimit.limit(await hashRateLimitIdentifier(identifier)),
      ),
  };
}

/**
 * ログイン用レート制限（より厳格）
 * 5リクエスト / 15分（Sliding Window）
 */
export const loginRateLimit = createRateLimiter(
  Ratelimit.slidingWindow(5, '15 m'),
  'ratelimit:product:login',
);

/**
 * パスワードリセット用レート制限
 * 3リクエスト / 1時間
 */
export const passwordResetRateLimit = createRateLimiter(
  Ratelimit.slidingWindow(3, '1 h'),
  'ratelimit:product:password-reset',
);

/**
 * お問い合わせ用レート制限
 * 5リクエスト / 1時間（Sliding Window）
 */
export const contactRateLimit = createRateLimiter(
  Ratelimit.slidingWindow(5, '1 h'),
  'ratelimit:product:contact',
);

/**
 * tRPC protectedProcedure 用レート制限
 * 100リクエスト / 1分 per user
 */
export const trpcUserRateLimit = createRateLimiter(
  Ratelimit.slidingWindow(100, '1 m'),
  'ratelimit:product:trpc:user',
);

/**
 * エントリ作成の日次上限
 * 500リクエスト / 24時間 per user
 */
export const timeblockCreateRateLimit = createRateLimiter(
  Ratelimit.slidingWindow(500, '24 h'),
  'ratelimit:product:timeblock:create',
);

/**
 * iCalフィード用レート制限
 * 10リクエスト / 1分 per token（外部カレンダーアプリからの購読用）
 */
export const icalFeedRateLimit = createRateLimiter(
  Ratelimit.slidingWindow(10, '1 m'),
  'ratelimit:product:ical-feed',
);

/** CSP reportは公開入力なのでIP単位と全体上限を別々に持つ。 */
export const cspReportRateLimit = createRateLimiter(
  Ratelimit.slidingWindow(20, '1 m'),
  'ratelimit:product:csp-report',
);

export const cspReportGlobalRateLimit = createRateLimiter(
  Ratelimit.slidingWindow(120, '1 m'),
  'ratelimit:product:csp-report-global',
);

/**
 * 汎用レート制限ミドルウェア
 *
 * @example
 * ```typescript
 * import { withUpstashRateLimit } from '@/lib/rate-limit/upstash'
 *
 * export async function POST(request: Request) {
 *   const result = await withUpstashRateLimit(request, loginRateLimit)
 *
 *   if (result.state === 'unavailable') return new Response('Unavailable', { status: 503 })
 *   if (result.state === 'checked' && !result.success) {
 *     return new Response('Too Many Requests', {
 *       status: 429,
 *       headers: {
 *         'X-RateLimit-Limit': result.limit.toString(),
 *         'X-RateLimit-Remaining': result.remaining.toString(),
 *         'X-RateLimit-Reset': result.reset.toString(),
 *         'Retry-After': Math.ceil((result.reset - Date.now()) / 1000).toString(),
 *       }
 *     })
 *   }
 *
 *   // 処理続行
 * }
 * ```
 */
type RateLimitCheckResult =
  | { state: 'disabled' }
  | { state: 'unavailable' }
  | ({ state: 'checked' } & Pick<
      RatelimitResponse,
      'success' | 'limit' | 'remaining' | 'reset' | 'pending'
    >);

export async function withUpstashRateLimit(
  request: Request,
  rateLimit: ProductRateLimiter | null,
): Promise<RateLimitCheckResult> {
  if (!rateLimit) {
    return { state: 'disabled' };
  }

  // クライアント識別子取得
  const identifier = getClientIdentifier(request);

  try {
    // レート制限チェック
    const { success, limit, remaining, reset, pending } = await rateLimit.limit(identifier);
    return { state: 'checked', success, limit, remaining, reset, pending };
  } catch (error) {
    logger.error('[RateLimit] Upstash rate limit check failed');
    const original = error instanceof Error ? error : new Error('Upstash rate limit check failed');
    captureUnexpectedError(original, {
      feature: 'rate_limit',
      operation: 'upstash_rate_limit_check',
      source: 'upstash',
    });
    return { state: 'unavailable' };
  }
}

/**
 * クライアント識別子の取得
 * 公開requestは検証済みIPを使い、limiter factory内でSHA-256化する。
 */
function getClientIdentifier(request: Request): string {
  // IPアドレスをフォールバック
  const ip = extractClientIp(
    request.headers.get('x-forwarded-for'),
    request.headers.get('x-real-ip'),
  );

  return `ip:${ip}`;
}

/**
 * レート制限プリセット
 *
 * 一般的な用途に応じた設定例
 */
export const RATE_LIMIT_PRESETS = {
  // 一般API（緩い）
  api: {
    requests: 60,
    window: '1 m',
    description: '60リクエスト/分',
  },

  // 認証エンドポイント（厳しい）
  auth: {
    requests: 5,
    window: '15 m',
    description: '5リクエスト/15分',
  },

  // パスワードリセット（非常に厳しい）
  passwordReset: {
    requests: 3,
    window: '1 h',
    description: '3リクエスト/時間',
  },

  // 検索（中程度）
  search: {
    requests: 30,
    window: '1 m',
    description: '30リクエスト/分',
  },

  // ファイルアップロード（厳しい）
  upload: {
    requests: 10,
    window: '1 h',
    description: '10リクエスト/時間',
  },
} as const;

/**
 * コスト見積もり
 *
 * Upstash料金（2024年時点）:
 * - 無料枠: 10,000リクエスト/日
 * - Pay-as-you-go: $0.2/100,000リクエスト
 *
 * Dayopt想定:
 * - DAU: 1,000ユーザー
 * - 1ユーザーあたり平均: 100リクエスト/日
 * - 合計: 100,000リクエスト/日 = 3,000,000リクエスト/月
 *
 * 月額コスト: 3,000,000 / 100,000 * $0.2 = $6
 *
 * → 非常にコストパフォーマンスが高い
 */
export const UPSTASH_COST_ESTIMATE = {
  freeQuota: 10_000,
  pricePerHundredThousand: 0.2,
  estimatedMonthlyRequests: 3_000_000,
  estimatedMonthlyCost: 6,
} as const;
