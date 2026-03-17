// 認証ガード（Edge Function 用）
// CRON_SECRET / Webhook 検証を共通化

import { log } from './logger.ts';
import { errorResponse } from './response.ts';

/**
 * 定数時間の文字列比較（タイミング攻撃対策）
 */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);

  if (bufA.byteLength !== bufB.byteLength) {
    // 長さが異なる場合もダミー比較で一定時間消費
    const dummy = new Uint8Array(bufA.byteLength);
    crypto.subtle.timingSafeEqual(bufA, dummy);
    return false;
  }

  return crypto.subtle.timingSafeEqual(bufA, bufB);
}

/**
 * CRON_SECRET による Bearer トークン検証
 * pg_cron から呼ばれる Edge Function で使用
 *
 * @returns null = 認証成功、Response = エラーレスポンス（そのまま return すること）
 */
export function verifyCronSecret(req: Request): Response | null {
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret) {
    log('error', 'CRON_SECRET is not configured');
    return errorResponse('Server misconfiguration', 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const expected = `Bearer ${cronSecret}`;

  if (!timingSafeEqual(authHeader, expected)) {
    log('warn', 'Unauthorized access attempt', {
      function: new URL(req.url).pathname,
    });
    return errorResponse('Unauthorized', 401);
  }

  return null;
}
