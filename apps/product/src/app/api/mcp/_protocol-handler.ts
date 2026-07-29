import 'server-only';

import {
  createMcpHandler,
  isLegacyRequest,
  WebStandardStreamableHTTPServerTransport,
  type AuthInfo,
  type McpHandlerRequestOptions,
} from '@modelcontextprotocol/server';

import { logger } from '@/lib/logger';
import {
  isSupportedScope,
  resolveClient,
  resolveRequestedResource,
  type SupportedScope,
} from '@/lib/oauth-server';
import { captureUnexpectedError } from '@/lib/sentry';

import type { McpRequestContext } from './_context';
import { createMcpServer } from './_server';

const modernHandler = createMcpHandler(
  ({ authInfo }) => createMcpServer(requireMcpRequestContext(authInfo)),
  { legacy: 'reject' },
);

export async function handleMcpProtocolRequest(
  request: Request,
  options: McpHandlerRequestOptions,
): Promise<Response> {
  const context = resolveMcpRequestContext(options.authInfo);
  if (!context) return invalidMcpRequestContextResponse();

  try {
    if (await isLegacyRequest(request, options.parsedBody)) {
      return await handleLegacyRequest(request, options, context);
    }
    return await modernHandler.fetch(request, options);
  } catch (error) {
    captureProtocolHandlerError(toError(error));
    return internalMcpErrorResponse();
  }
}

export function resolveMcpRequestContext(authInfo: AuthInfo | undefined): McpRequestContext | null {
  if (!authInfo || authInfo.token.length === 0) return null;

  const client = resolveClient(authInfo.clientId);
  if (!client) return null;

  const extra = authInfo.extra;
  const tokenId = readNonEmptyString(extra, 'tokenId');
  const connectionId = readNonEmptyString(extra, 'connectionId');
  const userId = readNonEmptyString(extra, 'userId');
  const extraResourceUri = readNonEmptyString(extra, 'resourceUri');
  if (!tokenId || !connectionId || !userId || !extraResourceUri || !authInfo.resource) return null;

  const resourceFromAuth = resolveRequestedResource(authInfo.resource.href);
  const resourceFromExtra = resolveRequestedResource(extraResourceUri);
  if (!resourceFromAuth || resourceFromAuth !== resourceFromExtra) return null;

  const scopes = authInfo.scopes;
  if (!scopes.every(isSupportedScope)) return null;

  return {
    tokenId,
    connectionId,
    userId,
    clientId: client.id,
    scopes: [...new Set(scopes)] as SupportedScope[],
    resourceUri: resourceFromAuth,
  };
}

async function handleLegacyRequest(
  request: Request,
  options: McpHandlerRequestOptions,
  context: McpRequestContext,
): Promise<Response> {
  const server = createMcpServer(context);
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });

  await server.connect(transport);
  return transport.handleRequest(request, options);
}

function requireMcpRequestContext(authInfo: AuthInfo | undefined): McpRequestContext {
  const context = resolveMcpRequestContext(authInfo);
  if (!context) throw new Error('Invalid MCP request context');
  return context;
}

function readNonEmptyString(
  value: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const candidate = value?.[key];
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

function invalidMcpRequestContextResponse(): Response {
  logger.error('MCP request context binding failed');
  return internalMcpErrorResponse();
}

function internalMcpErrorResponse(): Response {
  return Response.json(
    { jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null },
    { status: 500 },
  );
}

function captureProtocolHandlerError(error: Error): void {
  captureUnexpectedError(error, {
    feature: 'mcp',
    operation: 'handle_protocol_request',
    route: '/api/mcp',
  });
  logger.error('MCP protocol request failed');
}

function toError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('Unexpected MCP protocol failure', { cause: error });
}
