import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { env } from '@web/platform/config/env';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

/**
 * レート制限設定
 *
 * Upstash Redis を使用したレート制限。
 * 環境変数がない場合、Preview / Developmentだけはpass-throughにし、
 * Vercel Productionではfail-closedにする。
 */

const hasRedis = !!(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
const isProductionBuild = process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
const isVercelProduction = env.VERCEL_ENV === 'production';
const RATE_LIMIT_TIMEOUT_MS = 2_000;

// Redis クライアント（Upstash 設定時のみ）
const redis = hasRedis
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL!,
      token: env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : undefined;

if (!hasRedis && !isProductionBuild) {
  // production build では route module 評価時に繰り返し出るため抑止する。
  // runtime の production secret 検証は instrumentation.ts の assertProductionRuntimeEnv が担当する。
  console.warn(
    '[RateLimit] Upstash is not configured. All rate limits become pass-through (no protection). Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
  );
}

/**
 * レート制限の結果型（Ratelimit.limit() の戻り値と互換）
 */
type RatelimitResponse = Awaited<ReturnType<Ratelimit['limit']>>;

export class RateLimitUnavailableError extends Error {
  constructor() {
    super('Rate-limit backend is unavailable');
    this.name = 'RateLimitUnavailableError';
  }
}

/** Upstash returns success=true on SDK timeout; convert that fail-open result into an error. */
export function requireAvailableRateLimitResult(result: RatelimitResponse): RatelimitResponse {
  if (result.reason === 'timeout') throw new RateLimitUnavailableError();
  return result;
}

/**
 * Redis 未設定時のパススルー結果
 */
const passthroughResult: RatelimitResponse = {
  success: true,
  limit: 0,
  remaining: 0,
  reset: 0,
  pending: Promise.resolve(),
  reason: undefined,
};

/**
 * Ratelimit wrapper。Redis未設定のVercel Productionはfail-closedにする。
 */
function createRateLimiter(
  limiter: ReturnType<typeof Ratelimit.slidingWindow>,
  prefix: string,
): { limit: (identifier: string) => Promise<RatelimitResponse> } {
  if (!redis) {
    return {
      limit: async () => {
        if (isVercelProduction) throw new RateLimitUnavailableError();
        return passthroughResult;
      },
    };
  }

  const rateLimit = new Ratelimit({
    redis,
    limiter,
    analytics: false,
    prefix,
    timeout: RATE_LIMIT_TIMEOUT_MS,
  });
  return {
    limit: async (identifier) => requireAvailableRateLimitResult(await rateLimit.limit(identifier)),
  };
}

/**
 * コンタクトフォーム用レート制限
 *
 * - 同一IPから5分間に3回まで
 * - Upstash 未設定時はPreview / Developmentだけレート制限なし
 * - Vercel Productionでは未設定・timeoutともfail-closed
 */
export const contactRateLimit = createRateLimiter(
  Ratelimit.slidingWindow(3, '5 m'),
  'ratelimit:web:contact',
);

/** Bound aggregate contact-email spend even when abuse is distributed. */
export const contactGlobalRateLimit = createRateLimiter(
  Ratelimit.slidingWindow(60, '1 h'),
  'ratelimit:web:contact-global',
);

/**
 * 検索API用レート制限
 *
 * - 同一IPから1分間に30回まで
 */
export const searchRateLimit = createRateLimiter(
  Ratelimit.slidingWindow(30, '1 m'),
  'ratelimit:web:search',
);

/** CSP reports are unauthenticated browser input and need a separate low-volume quota. */
export const cspReportRateLimit = createRateLimiter(
  Ratelimit.slidingWindow(20, '1 m'),
  'ratelimit:web:csp-report',
);

/** Bound aggregate CSP ingestion even when abuse is distributed across many IPs. */
export const cspReportGlobalRateLimit = createRateLimiter(
  Ratelimit.slidingWindow(120, '1 m'),
  'ratelimit:web:csp-report-global',
);

/**
 * OG画像生成用レート制限（IP単位）
 *
 * blog記事のhero画像としても配信されるため緩め。異常なIPだけを絞る目的で、
 * render costの主な保護は入力長の上限(route側)とglobal quotaが担う。
 */
export const ogImageRateLimit = createRateLimiter(
  Ratelimit.slidingWindow(60, '1 m'),
  'ratelimit:web:og-image',
);

/** OG画像生成の全体quota。edge compute費用の天井を守る（暫定値）。 */
export const ogImageGlobalRateLimit = createRateLimiter(
  Ratelimit.slidingWindow(600, '1 m'),
  'ratelimit:web:og-image-global',
);

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Persist only a secret-keyed, one-way identifier in Upstash. */
export async function hashRateLimitIdentifier(identifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const value = encoder.encode(`dayopt-web:${identifier}`);
  const secret = env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!secret) return bytesToHex(await crypto.subtle.digest('SHA-256', value));

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return bytesToHex(await crypto.subtle.sign('HMAC', key, value));
}

/**
 * IP アドレスの取得
 *
 * Vercel の x-forwarded-for ヘッダーまたは x-real-ip から IP を取得
 */
export function getClientIp(request: Request): string {
  const vercelForwardedFor = request.headers.get('x-vercel-forwarded-for');
  if (vercelForwardedFor) {
    return vercelForwardedFor.split(',')[0]?.trim() ?? '127.0.0.1';
  }

  const forwardedFor = request.headers.get('x-forwarded-for');

  if (forwardedFor) {
    // x-forwarded-for は複数のIPをカンマ区切りで含む可能性がある
    // 最初のIPが実際のクライアントIP
    return forwardedFor.split(',')[0]?.trim() ?? '127.0.0.1';
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  // フォールバック（ローカル開発環境）
  return '127.0.0.1';
}
