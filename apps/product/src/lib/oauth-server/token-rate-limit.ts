import 'server-only';

import { logger } from '@/lib/logger';
import { oauthTokenGlobalRateLimit, oauthTokenIpRateLimit } from '@/lib/rate-limit/upstash';
import { extractClientIp } from '@/lib/security/ip-validation';
import { captureUnexpectedError } from '@/lib/sentry';

const LOCAL_IP_LIMIT = 10;
const LOCAL_GLOBAL_LIMIT = 120;
const LOCAL_WINDOW_MS = 60_000;
const localRequests = new Map<string, number[]>();

export type OAuthTokenRateLimitState = 'allowed' | 'limited' | 'unavailable';

export async function checkOAuthTokenRateLimit(
  request: Request,
): Promise<OAuthTokenRateLimitState> {
  const ip = extractClientIp(
    request.headers.get('x-forwarded-for'),
    request.headers.get('x-real-ip'),
  );
  const ipState = await checkRateLimit(
    oauthTokenIpRateLimit,
    `ip:${ip}`,
    LOCAL_IP_LIMIT,
    'check_oauth_token_ip_rate_limit',
  );
  if (ipState !== 'allowed') return ipState;

  return checkRateLimit(
    oauthTokenGlobalRateLimit,
    'all-clients',
    LOCAL_GLOBAL_LIMIT,
    'check_oauth_token_global_rate_limit',
  );
}

interface OAuthTokenRateLimiter {
  limit(identifier: string): Promise<{ success: boolean }>;
}

async function checkRateLimit(
  limiter: OAuthTokenRateLimiter | null,
  identifier: string,
  localLimit: number,
  operation: string,
): Promise<OAuthTokenRateLimitState> {
  if (!limiter) {
    if (requiresDistributedOAuthTokenRateLimit(process.env)) {
      logger.error('OAuth token rate limit configuration is unavailable');
      return 'unavailable';
    }
    return checkLocalLimit(identifier, localLimit) ? 'limited' : 'allowed';
  }

  try {
    const result = await limiter.limit(identifier);
    return result.success ? 'allowed' : 'limited';
  } catch (error) {
    const original =
      error instanceof Error ? error : new Error('OAuth token rate limit check failed');
    captureUnexpectedError(original, {
      feature: 'oauth',
      operation,
      route: '/api/oauth/token',
    });
    logger.error('OAuth token rate limit check failed');
    return 'unavailable';
  }
}

export function requiresDistributedOAuthTokenRateLimit(
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  return (
    environment.VERCEL_ENV === 'production' ||
    environment.VERCEL_TARGET_ENV === 'staging' ||
    environment.MCP_OAUTH_ENVIRONMENT === 'preview'
  );
}

function checkLocalLimit(identifier: string, limit: number): boolean {
  const now = Date.now();
  const recent = (localRequests.get(identifier) ?? []).filter(
    (timestamp) => now - timestamp < LOCAL_WINDOW_MS,
  );
  recent.push(now);
  localRequests.set(identifier, recent);

  if (localRequests.size > 10_000) {
    for (const [key, timestamps] of localRequests) {
      if (timestamps.every((timestamp) => now - timestamp >= LOCAL_WINDOW_MS)) {
        localRequests.delete(key);
      }
    }
  }

  return recent.length > limit;
}
