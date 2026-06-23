import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/env';
import type { Database } from '@/lib/database';

/**
 * OAuth 用 service-role client が触れる surface だけに narrow した DB 型。
 *
 * RLS bypass する client なので、他テーブル (entries / tags / etc.) や rpc / view を
 * 誤って query すると cross-tenant leak になる。Tables だけでなく Views / Functions /
 * Enums / CompositeTypes も空にして、`from('entries')` も `db.rpc(...)` も compile
 * error にする。
 */
type OAuthOnlyDatabase = {
  public: {
    Tables: Pick<Database['public']['Tables'], 'oauth_tokens' | 'oauth_authorization_codes'>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type OAuthSupabaseClient = SupabaseClient<OAuthOnlyDatabase>;

export function createOAuthDbClient(): OAuthSupabaseClient {
  return createClient<OAuthOnlyDatabase>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
