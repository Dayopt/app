import 'server-only';

import { SUPPORTED_SCOPES } from './scopes';

/**
 * AS / RS の URL は固定値で hardcode。
 *
 * RFC 8414 §3 では metadata の issuer はそれが提供されている URL と完全一致する
 * 必要がある。`NEXT_PUBLIC_APP_URL` は marketing apex (`dayopt.app`) を指しており、
 * AS は `app.dayopt.app` の subdomain で稼働する設計 (vercel.json rewrite が
 * `/.well-known/oauth-authorization-server` を `app.dayopt.app` host filter で
 * 拾う) のため、apex を返してしまうと `dayopt.app/oauth/authorize` のような
 * 存在しない URL を client に伝えてしまう。
 */
const AUTHORIZATION_SERVER_URL = 'https://app.dayopt.app';
const MCP_RESOURCE_URL = 'https://mcp.dayopt.app';

/**
 * RFC 8414 - OAuth 2.0 Authorization Server Metadata
 * https://datatracker.ietf.org/doc/html/rfc8414
 */
export function buildAuthorizationServerMetadata() {
  return {
    issuer: AUTHORIZATION_SERVER_URL,
    authorization_endpoint: `${AUTHORIZATION_SERVER_URL}/oauth/authorize`,
    // NOTE: 設計上は `/oauth/token` (vercel.json rewrite で /api/oauth/token に飛ぶ予定)
    // だが、Vercel rewrite が `/oauth/token` を Next.js 404 にキャッチされる挙動になっており
    // 動かないため、暫定で `/api/oauth/token` (実体 path) を直接 advertise する。
    // Phase 1.5 で rewrite の根本対処を試みる。
    token_endpoint: `${AUTHORIZATION_SERVER_URL}/api/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    /** Phase 1 は public client のみ (PKCE required, no client secret). */
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...SUPPORTED_SCOPES],
  } as const;
}

/**
 * RFC 9728 - OAuth 2.0 Protected Resource Metadata
 * https://datatracker.ietf.org/doc/html/rfc9728
 */
export function buildProtectedResourceMetadata() {
  return {
    resource: MCP_RESOURCE_URL,
    authorization_servers: [AUTHORIZATION_SERVER_URL],
    bearer_methods_supported: ['header'],
    scopes_supported: [...SUPPORTED_SCOPES],
  } as const;
}
