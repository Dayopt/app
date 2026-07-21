/**
 * Cloudflare Turnstile 検証（サーバーサイド）
 *
 * siteverify endpoint に secret + token を POST し、success boolean を返す。
 */

import { dayoptDomains } from '@dayopt/config';
import { z } from 'zod';

import { env } from '@web/platform/config/env';

import { TURNSTILE_CONFIG } from './config';

const TURNSTILE_VERIFY_TIMEOUT_MS = 5_000;
const PRODUCTION_HOSTNAMES: ReadonlySet<string> = new Set([
  dayoptDomains.marketing,
  dayoptDomains.www,
]);

export interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

const turnstileVerifyResponseSchema = z.object({
  success: z.boolean(),
  'error-codes': z.array(z.string()).optional(),
  challenge_ts: z.string().optional(),
  hostname: z.string().optional(),
  action: z.string().optional(),
  cdata: z.string().optional(),
});

function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

export async function verifyTurnstile(
  token: string | undefined,
  remoteIp?: string,
): Promise<TurnstileVerifyResponse> {
  if (isDevelopment() && !env.TURNSTILE_SECRET_KEY) {
    console.warn('[Turnstile] secret key not configured, skipping verification in development');
    return { success: true };
  }

  if (!token) {
    return { success: false, 'error-codes': ['missing-input-response'] };
  }

  if (!env.TURNSTILE_SECRET_KEY) {
    throw new Error('Turnstile secret key is not configured');
  }

  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
  });
  if (remoteIp) body.append('remoteip', remoteIp);

  const response = await fetch(TURNSTILE_CONFIG.VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(TURNSTILE_VERIFY_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error('Turnstile verification service returned an unsuccessful response');
  }

  const parsed = turnstileVerifyResponseSchema.safeParse(await response.json());
  if (!parsed.success)
    throw new Error('Turnstile verification service returned an invalid response');
  if (parsed.data.success && parsed.data.action !== TURNSTILE_CONFIG.ACTION) {
    return { success: false, 'error-codes': ['action-mismatch'] };
  }

  if (
    parsed.data.success &&
    env.VERCEL_ENV === 'production' &&
    (!parsed.data.hostname || !PRODUCTION_HOSTNAMES.has(parsed.data.hostname.toLowerCase()))
  ) {
    return { success: false, 'error-codes': ['hostname-mismatch'] };
  }

  return parsed.data;
}
