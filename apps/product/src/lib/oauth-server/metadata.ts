import 'server-only';

import { createDayoptUrl, dayoptUrls } from '@dayopt/config';

import { getCanonicalResourceUri } from './resource';
import { ADVERTISED_SCOPES } from './scopes';

/**
 * AS / RS の URL は固定値で hardcode。
 *
 * RFC 8414 §3 では metadata の issuer はそれが提供されている URL と完全一致する
 * 必要がある。`NEXT_PUBLIC_APP_URL` は marketing apex (`dayopt.app`) を指しており、
 * AS は `dayoptDomains.product` の subdomain で稼働する設計 (vercel.json rewrite が
 * `/.well-known/oauth-authorization-server` を product host filter で
 * 拾う) のため、apex を返してしまうと `dayopt.app/oauth/authorize` のような
 * 存在しない URL を client に伝えてしまう。
 */
const AUTHORIZATION_SERVER_URL = dayoptUrls.product;

/**
 * RFC 8414 - OAuth 2.0 Authorization Server Metadata
 * https://datatracker.ietf.org/doc/html/rfc8414
 */
export function buildAuthorizationServerMetadata() {
  return {
    issuer: AUTHORIZATION_SERVER_URL,
    authorization_endpoint: createDayoptUrl(AUTHORIZATION_SERVER_URL, '/oauth/authorize'),
    token_endpoint: createDayoptUrl(AUTHORIZATION_SERVER_URL, '/oauth/token'),
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    /** Phase 1 は public client のみ (PKCE required, no client secret). */
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...ADVERTISED_SCOPES],
  } as const;
}

/**
 * RFC 9728 - OAuth 2.0 Protected Resource Metadata
 * https://datatracker.ietf.org/doc/html/rfc9728
 */
export function buildProtectedResourceMetadata() {
  return {
    resource: getCanonicalResourceUri(),
    authorization_servers: [AUTHORIZATION_SERVER_URL],
    bearer_methods_supported: ['header'],
    scopes_supported: [...ADVERTISED_SCOPES],
  } as const;
}
