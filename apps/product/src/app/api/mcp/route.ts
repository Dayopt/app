import { NextResponse, type NextRequest } from 'next/server';

import { createDayoptUrl, dayoptUrls } from '@dayopt/config';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

import { logger } from '@/lib/logger';
import { extractBearerToken, verifyAccessToken } from '@/lib/mcp';
import { OAuthServerError } from '@/lib/oauth-server';
import { captureUnexpectedError } from '@/lib/sentry';

import { createMcpServer } from './_server';

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
  let auth;
  try {
    const token = extractBearerToken(request.headers.get('authorization'));
    auth = await verifyAccessToken(token);
  } catch (err) {
    return authErrorResponse(err);
  }

  const server = createMcpServer({
    userId: auth.userId,
    clientId: auth.clientId,
    scopes: auth.scopes,
  });
  // Phase 1: stateless mode (sessionIdGenerator omitted = stateless per SDK semantics)
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request, {
      authInfo: {
        token: '<redacted>',
        clientId: auth.clientId,
        scopes: auth.scopes,
        expiresAt: auth.expiresAt,
        extra: { userId: auth.userId, tokenId: auth.tokenId },
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

function authErrorResponse(err: unknown): Response {
  const isOAuthErr = err instanceof OAuthServerError;
  // OAuthServerError は err.httpStatus を尊重 (auth failure=401 / server_error=500 を保つ)。
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

  // WWW-Authenticate は client が再認証へ進めるサインなので 401 のときだけ付ける。
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (status === 401) {
    headers['www-authenticate'] = `Bearer resource_metadata="${RESOURCE_METADATA_URL}"`;
  }

  return new Response(
    JSON.stringify({
      error: isOAuthErr ? err.code : 'server_error',
      error_description:
        isOAuthErr && status < 500 ? err.message : 'Authentication service unavailable',
    }),
    {
      status,
      headers,
    },
  );
}
