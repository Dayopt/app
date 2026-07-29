import { NextResponse, type NextRequest } from 'next/server';

import { logger } from '@/lib/logger';
import {
  OAuthServerError,
  exchangeAuthorizationCode,
  refreshAccessToken,
  resolveClient,
  resolveRequestedResource,
} from '@/lib/oauth-server';
import { rejectUnexpectedOAuthHost } from '@/lib/oauth-server/request-host';
import {
  checkOAuthTokenRateLimit,
  type OAuthTokenRateLimitState,
} from '@/lib/oauth-server/token-rate-limit';
import { captureUnexpectedError } from '@/lib/sentry';

/**
 * RFC 6749 §3.2 - Token Endpoint
 *
 * POST application/x-www-form-urlencoded で grant_type に応じて token を発行する。
 *
 * Phase 1 で対応する grant_type:
 *   - authorization_code (PKCE 必須, code_verifier 検証)
 *   - refresh_token (rotation あり、旧 refresh は revoke)
 *
 * 認証は不要 (public client only — token endpoint auth method = "none")。
 * Vercel rewrite で product host の `/oauth/token` から到達する。
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const hostRejection = rejectUnexpectedOAuthHost(request);
  if (hostRejection) return hostRejection;

  const rateLimitState = await checkOAuthTokenRateLimit(request);
  if (rateLimitState !== 'allowed') return rateLimitErrorResponse(rateLimitState);

  try {
    const form = await readFormBody(request);
    const get = (key: string): string | undefined => form.get(key) ?? undefined;
    const grantType = get('grant_type');

    if (grantType === 'authorization_code') {
      const code = required(get('code'), 'code');
      const clientId = required(get('client_id'), 'client_id');
      const redirectUri = required(get('redirect_uri'), 'redirect_uri');
      const codeVerifier = required(get('code_verifier'), 'code_verifier');
      const resource = requiredResource(get('resource'));

      const client = resolveClient(clientId);
      if (!client) {
        throw new OAuthServerError('invalid_client', 'Unknown client_id');
      }

      const tokens = await exchangeAuthorizationCode({
        code,
        client_id: client.id,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        resource_uri: resource,
      });
      return tokenResponse(tokens);
    }

    if (grantType === 'refresh_token') {
      const refreshToken = required(get('refresh_token'), 'refresh_token');
      const clientId = required(get('client_id'), 'client_id');
      const resource = requiredResource(get('resource'));

      const client = resolveClient(clientId);
      if (!client) {
        throw new OAuthServerError('invalid_client', 'Unknown client_id');
      }

      const tokens = await refreshAccessToken({
        refresh_token: refreshToken,
        client_id: client.id,
        resource_uri: resource,
      });
      return tokenResponse(tokens);
    }

    throw new OAuthServerError(
      'unsupported_grant_type',
      `grant_type "${grantType ?? '(missing)'}" is not supported`,
    );
  } catch (err) {
    if (err instanceof OAuthServerError) {
      if (err.httpStatus >= 500) {
        const original = err.cause instanceof Error ? err.cause : err;
        captureUnexpectedError(original, {
          feature: 'oauth',
          operation: 'token_endpoint',
          route: '/api/oauth/token',
        });
        logger.error('OAuth token endpoint failed');
      }
      return errorResponse(err);
    }
    const original =
      err instanceof Error
        ? err
        : new Error('Unexpected OAuth token endpoint failure', { cause: err });
    captureUnexpectedError(original, {
      feature: 'oauth',
      operation: 'token_endpoint',
      route: '/api/oauth/token',
    });
    logger.error('OAuth token endpoint failed');
    return errorResponse(
      new OAuthServerError('server_error', 'Unexpected error', 500, { cause: original }),
    );
  }
}

async function readFormBody(request: NextRequest): Promise<URLSearchParams> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    throw new OAuthServerError(
      'invalid_request',
      'Content-Type must be application/x-www-form-urlencoded',
    );
  }
  return new URLSearchParams(await request.text());
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new OAuthServerError('invalid_request', `Missing required parameter: ${name}`);
  }
  return value;
}

function requiredResource(value: string | undefined) {
  const raw = required(value, 'resource');
  const resource = resolveRequestedResource(raw);
  if (!resource) {
    throw new OAuthServerError('invalid_target', 'The requested resource is not supported');
  }
  return resource;
}

function tokenResponse(body: unknown) {
  return NextResponse.json(body, {
    status: 200,
    headers: {
      'cache-control': 'no-store',
      pragma: 'no-cache',
    },
  });
}

function errorResponse(err: OAuthServerError) {
  return NextResponse.json(
    {
      error: err.code,
      error_description: err.httpStatus >= 500 ? 'OAuth server error' : err.message,
    },
    {
      status: err.httpStatus,
      headers: {
        'cache-control': 'no-store',
        pragma: 'no-cache',
      },
    },
  );
}

function rateLimitErrorResponse(state: Exclude<OAuthTokenRateLimitState, 'allowed'>): NextResponse {
  const unavailable = state === 'unavailable';
  return NextResponse.json(
    {
      error: unavailable ? 'server_error' : 'temporarily_unavailable',
      error_description: unavailable ? 'OAuth server error' : 'Too many requests',
    },
    {
      status: unavailable ? 503 : 429,
      headers: {
        'cache-control': 'no-store',
        pragma: 'no-cache',
        'retry-after': unavailable ? '5' : '60',
      },
    },
  );
}
