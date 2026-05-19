/**
 * Cloudflare Turnstile 検証（サーバーサイド）
 *
 * siteverify endpoint に secret + token を POST し、success boolean を返す。
 */

import { env } from '@/platform/config/env';

import { TURNSTILE_CONFIG } from './config';

export interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
}

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

  try {
    const body = new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY ?? '',
      response: token,
    });
    if (remoteIp) body.append('remoteip', remoteIp);

    const response = await fetch(TURNSTILE_CONFIG.VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      throw new Error(`Turnstile API returned ${response.status}`);
    }

    return (await response.json()) as TurnstileVerifyResponse;
  } catch (error) {
    console.error('[Turnstile] Verification error:', error);
    return { success: false, 'error-codes': ['verification-failed'] };
  }
}
