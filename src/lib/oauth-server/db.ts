import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/env';
import type { Database } from '@/lib/database.types';

/**
 * OAuth 用 service-role client が触れるテーブルだけに narrow した DB 型。
 *
 * RLS bypass する client なので、他テーブル (entries / tags / etc.) を誤って
 * 直 query すると cross-tenant leak になる。型レベルで `from('entries')` を
 * compile error にして事故を防ぐ。
 */
type OAuthOnlyDatabase = {
  public: {
    Tables: Pick<Database['public']['Tables'], 'oauth_tokens' | 'oauth_authorization_codes'>;
    Views: Database['public']['Views'];
    Functions: Database['public']['Functions'];
    Enums: Database['public']['Enums'];
    CompositeTypes: Database['public']['CompositeTypes'];
  };
};

export type OAuthSupabaseClient = SupabaseClient<OAuthOnlyDatabase>;

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
