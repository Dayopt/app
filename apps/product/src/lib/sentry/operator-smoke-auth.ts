import 'server-only';

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const PRODUCT_ORIGIN = 'https://app.dayopt.app';
const TOKEN_PATTERN = /^Bearer ([A-Za-z0-9_-]{43})$/u;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const ABSOLUTE_ACTIVE_FROM_MS = Date.parse('2026-07-16T10:00:00.000Z');
const ABSOLUTE_DEADLINE_MS = Date.parse('2026-07-16T14:00:00.000Z');
const SMOKE_RATE_LIMIT_TIMEOUT_MS = 2_000;

type SmokeEnvironment = Record<string, string | undefined>;
type RateLimitResult = 'allowed' | 'limited' | 'unavailable';

export function classifyOperatorSmokeRateLimitResult(result: {
  success: boolean;
  reason?: string;
}): RateLimitResult {
  if (result.reason === 'timeout') return 'unavailable';
  return result.success ? 'allowed' : 'limited';
}

interface OperatorSmokeDependencies {
  env?: SmokeEnvironment;
  now?: number;
  checkRateLimit?: (
    stage: 'per-ip' | 'global',
    request: Request,
    env: SmokeEnvironment,
  ) => Promise<RateLimitResult>;
}

type OperatorSmokeAuthorization = { authorized: true } | { authorized: false; response: Response };

export const OPERATOR_SMOKE_RESPONSE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  Vary: 'Authorization',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
} as const;

export function operatorSmokeUnavailableResponse(status = 404): Response {
  return new Response(null, {
    status,
    headers: {
      ...OPERATOR_SMOKE_RESPONSE_HEADERS,
      ...(status === 429 && { 'Retry-After': '3600' }),
    },
  });
}

function hasActiveConfiguration(env: SmokeEnvironment, now: number): boolean {
  if (env.VERCEL_ENV !== 'production' || env.SENTRY_OPERATOR_SMOKE_ENABLED !== 'true') {
    return false;
  }

  const expectedDigest = env.SENTRY_OPERATOR_SMOKE_TOKEN_SHA256;
  if (!expectedDigest || !DIGEST_PATTERN.test(expectedDigest)) return false;

  const expiresAt = Date.parse(env.SENTRY_OPERATOR_SMOKE_EXPIRES_AT ?? '');
  return (
    now >= ABSOLUTE_ACTIVE_FROM_MS &&
    now < ABSOLUTE_DEADLINE_MS &&
    Number.isFinite(expiresAt) &&
    expiresAt > now &&
    expiresAt <= ABSOLUTE_DEADLINE_MS
  );
}

function hasSameOriginBrowserRequest(request: Request): boolean {
  return (
    request.headers.get('origin') === PRODUCT_ORIGIN &&
    request.headers.get('sec-fetch-site') === 'same-origin'
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

function digestMatches(actual: Uint8Array, expectedHex: string): boolean {
  if (actual.length !== 32 || !DIGEST_PATTERN.test(expectedHex)) return false;

  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    const expected = Number.parseInt(expectedHex.slice(index * 2, index * 2 + 2), 16);
    difference |= actual[index]! ^ expected;
  }
  return difference === 0;
}

async function hasValidToken(request: Request, expectedDigest: string): Promise<boolean> {
  const authorization = request.headers.get('authorization');
  if (!authorization || authorization.length !== 50) return false;

  const match = TOKEN_PATTERN.exec(authorization);
  if (!match?.[1]) return false;

  return digestMatches(await sha256(match[1]), expectedDigest);
}

function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',', 1)[0]?.trim();
  const address = forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
  return address.slice(0, 256);
}

async function checkProductSmokeRateLimit(
  stage: 'per-ip' | 'global',
  request: Request,
  env: SmokeEnvironment,
): Promise<RateLimitResult> {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return 'unavailable';

  try {
    const redis = new Redis({ url, token });
    if (stage === 'per-ip') {
      const perIp = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(12, '1 h'),
        analytics: false,
        prefix: 'ratelimit:product:sentry-smoke:ip',
        timeout: SMOKE_RATE_LIMIT_TIMEOUT_MS,
      });
      const addressDigest = bytesToHex(await sha256(clientAddress(request)));
      return classifyOperatorSmokeRateLimitResult(await perIp.limit(addressDigest));
    }

    const global = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(50, '1 h'),
      analytics: false,
      prefix: 'ratelimit:product:sentry-smoke:global',
      timeout: SMOKE_RATE_LIMIT_TIMEOUT_MS,
    });
    return classifyOperatorSmokeRateLimitResult(await global.limit('all'));
  } catch {
    return 'unavailable';
  }
}

export async function authorizeProductOperatorSmoke(
  request: Request,
  dependencies: OperatorSmokeDependencies = {},
): Promise<OperatorSmokeAuthorization> {
  const env = dependencies.env ?? process.env;
  const now = dependencies.now ?? Date.now();

  if (
    !hasActiveConfiguration(env, now) ||
    !hasSameOriginBrowserRequest(request) ||
    request.body !== null
  ) {
    return { authorized: false, response: operatorSmokeUnavailableResponse() };
  }

  const checkRateLimit = dependencies.checkRateLimit ?? checkProductSmokeRateLimit;
  const perIpRateLimit = await checkRateLimit('per-ip', request, env);
  if (perIpRateLimit !== 'allowed') {
    return {
      authorized: false,
      response: operatorSmokeUnavailableResponse(perIpRateLimit === 'limited' ? 429 : 503),
    };
  }

  const expectedDigest = env.SENTRY_OPERATOR_SMOKE_TOKEN_SHA256;
  if (!expectedDigest || !(await hasValidToken(request, expectedDigest))) {
    return { authorized: false, response: operatorSmokeUnavailableResponse() };
  }

  const globalRateLimit = await checkRateLimit('global', request, env);
  if (globalRateLimit !== 'allowed') {
    return {
      authorized: false,
      response: operatorSmokeUnavailableResponse(globalRateLimit === 'limited' ? 429 : 503),
    };
  }

  return { authorized: true };
}
