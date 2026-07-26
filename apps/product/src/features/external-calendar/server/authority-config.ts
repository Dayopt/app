import 'server-only';

import { env } from '@/env';

const GOOGLE_OAUTH_CLIENT_ID_PATTERN =
  /^([1-9][0-9]{5,29})-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;

/**
 * Calendar authority と OAuth credential が共有する immutable Google Cloud project number。
 *
 * client ID の prefix と明示 env の両方を照合し、別 project の credential を同じ
 * authority fence で扱わないよう fail-close する。
 */
export function resolveGoogleCalendarProjectKey(): string | null {
  const clientId = env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const configuredProjectNumber = env.GOOGLE_CALENDAR_PROJECT_NUMBER?.trim();
  if (!clientId || !configuredProjectNumber) return null;

  const match = GOOGLE_OAUTH_CLIENT_ID_PATTERN.exec(clientId);
  if (!match || match[1] !== configuredProjectNumber) return null;

  return configuredProjectNumber;
}
