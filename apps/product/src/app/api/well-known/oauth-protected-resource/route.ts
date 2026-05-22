import { NextResponse } from 'next/server';

import { buildProtectedResourceMetadata } from '@/lib/oauth-server/metadata';

/**
 * RFC 9728 - OAuth 2.0 Protected Resource Metadata
 *
 * Public metadata. Production MCP host の `/.well-known/oauth-protected-resource`
 * からの vercel rewrite で到達する。
 *
 * MCP client (Claude.ai connectors 等) は MCP server を Bearer token なしで叩いた際の
 * `WWW-Authenticate` の `resource_metadata` フィールドからこの URL を発見し、
 * authorization_servers から AS metadata を辿って OAuth flow を開始する。
 */
export function GET() {
  const metadata = buildProtectedResourceMetadata();
  return NextResponse.json(metadata, {
    headers: {
      'cache-control': 'public, max-age=3600',
    },
  });
}
