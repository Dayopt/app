// 認証ガード（Edge Function 用）
// CRON_SECRET / Webhook 検証を共通化

import { log } from './logger.ts';
import { errorResponse } from './response.ts';

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

  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    log('warn', 'Unauthorized access attempt', {
      function: new URL(req.url).pathname,
    });
    return errorResponse('Unauthorized', 401);
  }

  return null;
}
