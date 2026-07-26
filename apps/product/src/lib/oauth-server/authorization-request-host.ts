import 'server-only';

import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { logger } from '@/lib/logger';

import { isOAuthRequestHostAllowed } from './identity';
import { getOAuthEnvironmentConfig } from './identity-env';

/**
 * Re-check the actual Server Component / Server Action request host before
 * authorization parameters, user state, or grants are read or written.
 */
export async function assertOAuthAuthorizationRequestHost(): Promise<void> {
  const requestHeaders = await headers();
  const hostname = parseHostHeader(requestHeaders.get('host'));

  let identity;
  try {
    identity = getOAuthEnvironmentConfig();
  } catch {
    logger.error('OAuth deployment identity is invalid');
    notFound();
  }

  if (
    !hostname ||
    !isOAuthRequestHostAllowed({
      identity,
      hostname,
      pathname: '/oauth/consent',
      allowLocalDevelopment: process.env.NODE_ENV === 'development' && !process.env.VERCEL_ENV,
    })
  ) {
    notFound();
  }
}

function parseHostHeader(value: string | null): string | null {
  if (!value) return null;

  let parsed: URL;
  try {
    parsed = new URL(`https://${value}`);
  } catch {
    return null;
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    return null;
  }

  return parsed.hostname.toLowerCase();
}
