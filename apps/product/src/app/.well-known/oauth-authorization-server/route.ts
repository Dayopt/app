import { NextResponse } from 'next/server';

import { buildAuthorizationServerMetadata } from '@/lib/oauth-server/metadata';
import { rejectUnexpectedOAuthHost } from '@/lib/oauth-server/request-host';

/** RFC 8414 metadata at its canonical filesystem-backed public path. */
export function GET(request: Request) {
  const hostRejection = rejectUnexpectedOAuthHost(request);
  if (hostRejection) return hostRejection;

  return NextResponse.json(buildAuthorizationServerMetadata(), {
    headers: {
      'cache-control': 'public, max-age=3600',
    },
  });
}
