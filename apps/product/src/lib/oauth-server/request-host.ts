import 'server-only';

import { NextResponse } from 'next/server';

import { isOAuthRequestHostAllowed } from './identity';
import { getOAuthEnvironmentConfig } from './identity-env';

/**
 * Defense in depth for direct `/api/*` access that bypasses public rewrites.
 * Proxy applies the same pure policy before routing; handlers repeat it before
 * token, database, or metadata work.
 */
export function rejectUnexpectedOAuthHost(request: Request): Response | null {
  let identity;
  try {
    identity = getOAuthEnvironmentConfig();
  } catch {
    return NextResponse.json(
      { error: 'service_unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }

  const url = new URL(request.url);
  if (
    isOAuthRequestHostAllowed({
      identity,
      hostname: url.hostname,
      pathname: url.pathname,
      allowLocalDevelopment: process.env.NODE_ENV === 'development' && !process.env.VERCEL_ENV,
    })
  ) {
    return null;
  }

  return NextResponse.json(
    { error: 'not_found' },
    { status: 404, headers: { 'cache-control': 'no-store' } },
  );
}
