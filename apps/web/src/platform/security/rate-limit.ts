import { env } from '@/platform/config/env';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * レート制限設定
 *
 * Upstash Redis を使用したレート制限。
 * 環境変数が設定されていない場合はレート制限をスキップ（開発環境用）
 */

const hasRedis = !!(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);

// Redis クライアント（Upstash 設定時のみ）
const redis = hasRedis
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL!,
      token: env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : undefined;

if (!hasRedis) {
  // production では env.ts の validateRequiredEnv が起動時に throw するため、ここに到達するのは dev/test のみ
  console.warn(
    '[RateLimit] Upstash is not configured. All rate limits become pass-through (no protection). Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
  );
}

/**
 * レート制限の結果型（Ratelimit.limit() の戻り値と互換）
 */
type RatelimitResponse = Awaited<ReturnType<Ratelimit['limit']>>;

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
 * Ratelimit または Redis 未設定時のパススルーラッパー
 */
function createRateLimiter(
  limiter: ReturnType<typeof Ratelimit.slidingWindow>,
  prefix: string,
): { limit: (identifier: string) => Promise<RatelimitResponse> } {
  if (!redis) {
    return { limit: async () => passthroughResult };
  }

  return new Ratelimit({
    redis,
    limiter,
    analytics: false,
    prefix,
  });
}

/**
 * コンタクトフォーム用レート制限
 *
 * - 同一IPから5分間に3回まで
 * - Upstash 未設定時はレート制限なし
 */
export const contactRateLimit = createRateLimiter(
  Ratelimit.slidingWindow(3, '5 m'),
  'ratelimit:contact',
);

/**
 * 検索API用レート制限
 *
 * - 同一IPから1分間に30回まで
 */
export const searchRateLimit = createRateLimiter(
  Ratelimit.slidingWindow(30, '1 m'),
  'ratelimit:search',
);

/**
 * タグAPI用レート制限
 *
 * - 同一IPから1分間に60回まで
 */
export const tagsRateLimit = createRateLimiter(
  Ratelimit.slidingWindow(60, '1 m'),
  'ratelimit:tags',
);

/**
 * IP アドレスの取得
 *
 * Vercel の x-forwarded-for ヘッダーまたは x-real-ip から IP を取得
 */
export function getClientIp(request: Request): string {
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
