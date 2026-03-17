// 共通レスポンスビルダー（Edge Function 用）
// JSON レスポンス構築の重複を排除

import { corsHeaders } from './cors.ts';

/**
 * JSON 成功レスポンスを構築
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * JSON エラーレスポンスを構築
 */
export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}

/**
 * CORS preflight レスポンス
 */
export function corsResponse(): Response {
  return new Response('ok', { headers: corsHeaders });
}
