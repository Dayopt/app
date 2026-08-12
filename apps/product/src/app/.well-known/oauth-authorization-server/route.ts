import { NextResponse } from 'next/server';

import { buildAuthorizationServerMetadata } from '@/lib/oauth-server/metadata';
import { rejectUnexpectedOAuthHost } from '@/lib/oauth-server/request-host';

/** env から静的にメタデータを組み立てるだけで、外部 I/O も await も無い。 */
export const maxDuration = 15;

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
