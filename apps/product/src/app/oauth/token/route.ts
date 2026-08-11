/**
 * RFC 6749 §3.2 - Token Endpoint（canonical public path）
 *
 * well-known と同じ filesystem route 方式で、Production / Preview のどの host でも
 * rewrite に依存せず `/oauth/token` を解決する。host 分離は handler 冒頭の
 * `rejectUnexpectedOAuthHost` が担い、MCP host からの到達は 404 になる。
 * 旧 public path の `/api/oauth/token` は互換のため同じ handler を公開し続ける。
 */
export const dynamic = 'force-dynamic';
/** `@/app/api/oauth/token/route` の同一 handler を re-export するだけなので、同じ予算を適用する。 */
export const maxDuration = 60;

export { POST } from '@/app/api/oauth/token/route';
