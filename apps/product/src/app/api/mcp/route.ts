import { NextResponse, type NextRequest } from 'next/server';

import { createDayoptUrl, dayoptUrls } from '@dayopt/config';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

import { logger } from '@/lib/logger';
import { extractBearerToken, verifyAccessToken } from '@/lib/mcp';
import {
  checkMcpPreAuthRateLimit,
  checkMcpUserRateLimit,
  type McpRateLimitState,
} from '@/lib/mcp/request-rate-limit';
import { ADVERTISED_SCOPES, OAuthServerError, type SupportedScope } from '@/lib/oauth-server';
import { captureUnexpectedError } from '@/lib/sentry';

import { createMcpServer } from './_server';
import { getRequiredScopeForTool, mergeMcpChallengeScopes } from './_tools/registry';

/**
 * MCP Streamable HTTP endpoint.
 *
 * Bearer token を `oauth_tokens` で検証 → per-request stateless transport を立て、
 * MCP server に dispatch する。
 *
 * Vercel rewrite で MCP host の `/` から到達する (production)。
 * `/mcp` も既存 client 向けの互換 alias として同じ handler に到達する。
 * 401 のときは `WWW-Authenticate` の `resource_metadata` で client が
 * `/.well-known/oauth-protected-resource` を辿れるようにする (MCP spec 2025-03)。
 */

const RESOURCE_METADATA_URL = createDayoptUrl(
  dayoptUrls.mcp,
  '/.well-known/oauth-protected-resource',
);

export const dynamic = 'force-dynamic';

const MAX_REQUEST_BODY_BYTES = 1024 * 1024;

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function DELETE(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest): Promise<Response> {
  const preAuthRateLimitState = await checkMcpPreAuthRateLimit(request);
  if (preAuthRateLimitState !== 'allowed') return rateLimitErrorResponse(preAuthRateLimitState);

  let auth;
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    auth = await verifyAccessToken(token);
  } catch (err) {
    return authErrorResponse(err);
  }

  const rateLimitState = await checkMcpUserRateLimit(auth.userId);
  if (rateLimitState !== 'allowed') return rateLimitErrorResponse(rateLimitState);

  const parsedRequest = await parseMcpRequestBody(request);
  if (!parsedRequest.ok) return parsedRequest.response;

  const missingScopes = collectMissingToolScopes(parsedRequest.body, auth.scopes);
  if (missingScopes.length > 0) {
    return insufficientScopeResponse(auth.scopes, missingScopes);
  }

  const server = createMcpServer({
    tokenId: auth.tokenId,
    connectionId: auth.connectionId,
    userId: auth.userId,
    clientId: auth.clientId,
    scopes: auth.scopes,
    resourceUri: auth.resourceUri,
  });
  // Phase 1: stateless mode (sessionIdGenerator omitted = stateless per SDK semantics)
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request, {
      ...(parsedRequest.body === undefined ? {} : { parsedBody: parsedRequest.body }),
      authInfo: {
        token: '<redacted>',
        clientId: auth.clientId,
        scopes: auth.scopes,
        expiresAt: auth.expiresAt,
        extra: {
          userId: auth.userId,
          tokenId: auth.tokenId,
          connectionId: auth.connectionId,
          resourceUri: auth.resourceUri,
        },
      },
    });
  } catch (err) {
    const original =
      err instanceof Error ? err : new Error('Unexpected MCP transport failure', { cause: err });
    captureUnexpectedError(original, {
      feature: 'mcp',
      operation: 'handle_transport_request',
      route: '/api/mcp',
    });
    logger.error('MCP transport request failed');
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null },
      { status: 500 },
    );
  }
}

type ParsedMcpRequest = { ok: true; body: unknown | undefined } | { ok: false; response: Response };

async function parseMcpRequestBody(request: NextRequest): Promise<ParsedMcpRequest> {
  if (request.method !== 'POST') return { ok: true, body: undefined };

  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
    return { ok: false, response: mcpRequestErrorResponse(413, -32000, 'Request body too large') };
  }

  const bodyText = await request.text();
  if (new TextEncoder().encode(bodyText).byteLength > MAX_REQUEST_BODY_BYTES) {
    return { ok: false, response: mcpRequestErrorResponse(413, -32000, 'Request body too large') };
  }

  try {
    const body = JSON.parse(bodyText) as unknown;
    if (Array.isArray(body)) {
      return {
        ok: false,
        response: mcpRequestErrorResponse(400, -32600, 'JSON-RPC batch is not supported'),
      };
    }
    return { ok: true, body };
  } catch {
    return { ok: false, response: mcpRequestErrorResponse(400, -32700, 'Parse error') };
  }
}

function collectMissingToolScopes(
  body: unknown,
  grantedScopes: readonly SupportedScope[],
): SupportedScope[] {
  const missing = new Set<SupportedScope>();

  if (!isRecord(body) || body.method !== 'tools/call' || !isRecord(body.params)) return [];
  const toolName = body.params.name;
  if (typeof toolName !== 'string') return [];
  const requiredScope = getRequiredScopeForTool(toolName);
  if (requiredScope && !grantedScopes.includes(requiredScope)) missing.add(requiredScope);

  return [...missing];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function insufficientScopeResponse(
  grantedScopes: readonly SupportedScope[],
  missingScopes: readonly SupportedScope[],
): Response {
  const requiredScopes = mergeMcpChallengeScopes(grantedScopes, missingScopes);
  const required = requiredScopes.join(' ');
  return NextResponse.json(
    {
      error: 'insufficient_scope',
      error_description: 'Additional authorization is required',
      scope: required,
    },
    {
      status: 403,
      headers: {
        'cache-control': 'no-store',
        'www-authenticate':
          `Bearer error="insufficient_scope", scope="${required}", ` +
          `resource_metadata="${RESOURCE_METADATA_URL}"`,
      },
    },
  );
}

function mcpRequestErrorResponse(status: number, code: number, message: string): Response {
  return NextResponse.json(
    { jsonrpc: '2.0', error: { code, message }, id: null },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

function rateLimitErrorResponse(state: Exclude<McpRateLimitState, 'allowed'>): Response {
  const unavailable = state === 'unavailable';
  return NextResponse.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: unavailable ? 'Rate limit service unavailable' : 'Too many requests',
      },
      id: null,
    },
    {
      status: unavailable ? 503 : 429,
      headers: {
        'cache-control': 'no-store',
        'retry-after': unavailable ? '5' : '60',
      },
    },
  );
}

function authErrorResponse(err: unknown): Response {
  const isOAuthErr = err instanceof OAuthServerError;
  // OAuthServerError は err.httpStatus を尊重 (auth failure=401 / dependency failure=503)。
  // 5xx を 401 に丸めると client が再認証ループに入って真の障害が観測できない。
  const status = isOAuthErr ? err.httpStatus : 500;
  if (status >= 500) {
    const original =
      isOAuthErr && err.cause instanceof Error
        ? err.cause
        : err instanceof Error
          ? err
          : new Error('Unexpected MCP authentication failure', { cause: err });
    captureUnexpectedError(original, {
      feature: 'mcp',
      operation: 'authenticate_request',
      route: '/api/mcp',
    });
    logger.error('MCP request authentication failed');
  }

  // 401 discovery/invalid token と 400 invalid_request はBearer challengeを返す。
  const headers: Record<string, string> = { 'cache-control': 'no-store' };
  if (status === 401 || (status === 400 && isOAuthErr && err.code === 'invalid_request')) {
    const challengeParameters = [
      ...(isOAuthErr && err.code === 'invalid_token' ? ['error="invalid_token"'] : []),
      ...(isOAuthErr && err.code === 'invalid_request' && status === 400
        ? ['error="invalid_request"']
        : []),
      `scope="${ADVERTISED_SCOPES.join(' ')}"`,
      `resource_metadata="${RESOURCE_METADATA_URL}"`,
    ];
    headers['www-authenticate'] = `Bearer ${challengeParameters.join(', ')}`;
  }
  if (status === 503) {
    headers['retry-after'] = '5';
  }

  // RFC 6750 §3.1: credentialなし / unsupported auth scheme の401では、
  // discovery challenge以外のerror情報を返さない。
  if (status === 401 && isOAuthErr && err.code === 'invalid_request') {
    return new Response(null, { status, headers });
  }

  headers['content-type'] = 'application/json';

  return new Response(
    JSON.stringify({
      error: isOAuthErr ? err.code : 'server_error',
      error_description:
        isOAuthErr && err.code === 'invalid_token'
          ? 'Access token is invalid or expired'
          : isOAuthErr && status < 500
            ? err.message
            : 'Authentication service unavailable',
    }),
    {
      status,
      headers,
    },
  );
}
