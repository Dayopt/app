import { NextResponse } from 'next/server';

import { buildAuthorizationServerMetadata } from '@/lib/oauth-server/metadata';

/**
 * RFC 8414 - OAuth 2.0 Authorization Server Metadata
 *
 * Public metadata. Production hostname `app.dayopt.app` の `/.well-known/oauth-authorization-server`
 * からの vercel rewrite で到達する。
 *
 * MCP / OAuth client (Claude.ai connectors 等) が discovery 用に取得する。
 */
export function GET() {
  const metadata = buildAuthorizationServerMetadata();
  return NextResponse.json(metadata, {
    headers: {
      'cache-control': 'public, max-age=3600',
    },
  });
}
