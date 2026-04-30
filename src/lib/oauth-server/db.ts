import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/env';

import type { OAuthClientId } from './clients';
import type { SupportedScope } from './scopes';

/**
 * TODO(post-deploy): migration 適用後 `npm run types:generate` で
 * `@/lib/database.types` の `Database` 型に oauth_tokens / oauth_authorization_codes が
 * 反映される。それまでローカルで型を定義する。反映後はこのファイルを削除して
 * `import type { Database } from '@/lib/database.types'` に置換する。
 */

interface OauthTokensTable {
  Row: {
    id: string;
    user_id: string;
    token_hash: string;
    token_type: 'access' | 'refresh';
    client_id: OAuthClientId;
    scopes: SupportedScope[];
    expires_at: string;
    revoked_at: string | null;
    parent_token_id: string | null;
    last_used_at: string | null;
    created_at: string;
  };
  Insert: {
    id?: string;
    user_id: string;
    token_hash: string;
    token_type: 'access' | 'refresh';
    client_id: OAuthClientId;
    scopes?: SupportedScope[];
    expires_at: string;
    revoked_at?: string | null;
    parent_token_id?: string | null;
    last_used_at?: string | null;
    created_at?: string;
  };
  Update: Partial<OauthTokensTable['Insert']>;
  Relationships: [];
}

interface OauthAuthorizationCodesTable {
  Row: {
    code_hash: string;
    user_id: string;
    client_id: OAuthClientId;
    redirect_uri: string;
    code_challenge: string;
    code_challenge_method: 'S256';
    scopes: SupportedScope[];
    expires_at: string;
    consumed_at: string | null;
    created_at: string;
  };
  Insert: {
    code_hash: string;
    user_id: string;
    client_id: OAuthClientId;
    redirect_uri: string;
    code_challenge: string;
    code_challenge_method: 'S256';
    scopes: SupportedScope[];
    expires_at?: string;
    consumed_at?: string | null;
    created_at?: string;
  };
  Update: Partial<OauthAuthorizationCodesTable['Insert']>;
  Relationships: [];
}

interface OAuthDatabase {
  public: {
    Tables: {
      oauth_tokens: OauthTokensTable;
      oauth_authorization_codes: OauthAuthorizationCodesTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type OAuthSupabaseClient = SupabaseClient<OAuthDatabase>;

/**
 * Service-role client scoped to OAuth tables only.
 *
 * RLS bypass のため取り扱い注意。oauth_tokens / oauth_authorization_codes 以外には触らない。
 */
export function createOAuthDbClient(): OAuthSupabaseClient {
  return createClient<OAuthDatabase>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
