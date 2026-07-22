import 'server-only';

import {
  getClientIp,
  hashRateLimitIdentifier,
  operatorSentrySmokeGlobalRateLimit,
  operatorSentrySmokeRateLimit,
} from '@web/platform/security/rate-limit';

const WEB_ORIGIN = 'https://dayopt.app';
const TOKEN_PATTERN = /^Bearer ([A-Za-z0-9_-]{43})$/u;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/u;
const ABSOLUTE_ACTIVE_FROM_MS = Date.parse('2026-07-21T23:00:00.000Z');
const ABSOLUTE_DEADLINE_MS = Date.parse('2026-07-22T12:00:00.000Z');

type SmokeEnvironment = Record<string, string | undefined>;
type RateLimitResult = 'allowed' | 'limited' | 'unavailable';

interface OperatorSmokeDependencies {
  env?: SmokeEnvironment;
  now?: number;
  checkRateLimit?: (stage: 'per-ip' | 'global', request: Request) => Promise<RateLimitResult>;
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
    request.headers.get('origin') === WEB_ORIGIN &&
    request.headers.get('sec-fetch-site') === 'same-origin'
  );
}

function hasNoDeclaredRequestBody(request: Request): boolean {
  if (request.headers.has('transfer-encoding')) return false;

  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) return contentLength.trim() === '0';

  return request.body === null;
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

async function checkWebSmokeRateLimit(
  stage: 'per-ip' | 'global',
  request: Request,
): Promise<RateLimitResult> {
  try {
    const result =
      stage === 'per-ip'
        ? await operatorSentrySmokeRateLimit.limit(
            await hashRateLimitIdentifier(getClientIp(request)),
          )
        : await operatorSentrySmokeGlobalRateLimit.limit('all');
    return result.success ? 'allowed' : 'limited';
  } catch {
    return 'unavailable';
  }
}

export async function authorizeWebOperatorSmoke(
  request: Request,
  dependencies: OperatorSmokeDependencies = {},
): Promise<OperatorSmokeAuthorization> {
  const env = dependencies.env ?? process.env;
  const now = dependencies.now ?? Date.now();

  if (
    !hasActiveConfiguration(env, now) ||
    !hasSameOriginBrowserRequest(request) ||
    !hasNoDeclaredRequestBody(request)
  ) {
    return { authorized: false, response: operatorSmokeUnavailableResponse() };
  }

  const checkRateLimit = dependencies.checkRateLimit ?? checkWebSmokeRateLimit;
  const perIpRateLimit = await checkRateLimit('per-ip', request);
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

  const globalRateLimit = await checkRateLimit('global', request);
  if (globalRateLimit !== 'allowed') {
    return {
      authorized: false,
      response: operatorSmokeUnavailableResponse(globalRateLimit === 'limited' ? 429 : 503),
    };
  }

  return { authorized: true };
}
