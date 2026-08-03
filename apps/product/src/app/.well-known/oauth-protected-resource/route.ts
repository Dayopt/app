import { NextResponse } from 'next/server';

import { buildProtectedResourceMetadata } from '@/lib/oauth-server/metadata';
import { rejectUnexpectedOAuthHost } from '@/lib/oauth-server/request-host';

/** RFC 9728 metadata at its canonical filesystem-backed public path. */
export function GET(request: Request) {
  const hostRejection = rejectUnexpectedOAuthHost(request);
  if (hostRejection) return hostRejection;

  return NextResponse.json(buildProtectedResourceMetadata(), {
    headers: {
      'cache-control': 'public, max-age=3600',
    },
  });
}
