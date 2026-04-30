import 'server-only';

import { isAllowedRedirectUri, resolveClient, type OAuthClient } from './clients';
import { parseRequestedScope, type SupportedScope } from './scopes';

/**
 * `/oauth/authorize` の入力 (raw query string) を検証する。
 *
 * Phase 1 では PKCE S256 と response_type=code のみ受け付ける。
 * client_id / redirect_uri は static allowlist 照合 (Phase 2 で DCR に置換)。
 */
export interface AuthorizeInput {
  response_type?: string | undefined;
  client_id?: string | undefined;
  redirect_uri?: string | undefined;
  code_challenge?: string | undefined;
  code_challenge_method?: string | undefined;
  scope?: string | undefined;
  state?: string | undefined;
}

export type AuthorizeValidationError =
  | 'unsupported_response_type'
  | 'invalid_client'
  | 'invalid_redirect_uri'
  | 'missing_pkce';

export type AuthorizeValidationResult =
  | {
      ok: true;
      client: OAuthClient;
      scopes: SupportedScope[];
      redirectUri: string;
      codeChallenge: string;
      state: string | null;
    }
  | { ok: false; error: AuthorizeValidationError };

export function validateAuthorizeInput(input: AuthorizeInput): AuthorizeValidationResult {
  if (input.response_type !== 'code') {
    return { ok: false, error: 'unsupported_response_type' };
  }
  const client = resolveClient(input.client_id ?? null);
  if (!client) {
    return { ok: false, error: 'invalid_client' };
  }
  if (!input.redirect_uri || !isAllowedRedirectUri(client, input.redirect_uri)) {
    return { ok: false, error: 'invalid_redirect_uri' };
  }
  if (!input.code_challenge || input.code_challenge_method !== 'S256') {
    return { ok: false, error: 'missing_pkce' };
  }
  return {
    ok: true,
    client,
    scopes: parseRequestedScope(input.scope),
    redirectUri: input.redirect_uri,
    codeChallenge: input.code_challenge,
    state: input.state ?? null,
  };
}
