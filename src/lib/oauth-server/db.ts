import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/env';
import type { Database } from '@/lib/database.types';

/**
 * OAuth runtime 用の service-role Supabase client。
 *
 * 取り扱い注意: RLS bypass する。`oauth_tokens` / `oauth_authorization_codes` 以外
 * のテーブルには触らないこと (cross-tenant leak のリスク)。
 *
 * 型は `npm run types:generate` で生成された `Database` 型を使う。
 * client_id / scopes は string / string[] と緩い型になるため、読み出し側で
 * `OAuthClientId` / `SupportedScope[]` に narrow する責任を持つ。
 */
export type OAuthSupabaseClient = SupabaseClient<Database>;

export function createOAuthDbClient(): OAuthSupabaseClient {
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
