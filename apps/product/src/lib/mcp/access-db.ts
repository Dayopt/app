import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/env';
import type { Database } from '@/lib/database';

/** Service-role surface used only while verifying an MCP access token. */
type McpAccessDatabase = {
  public: {
    Tables: Pick<
      Database['public']['Tables'],
      'mcp_mutation_control' | 'oauth_connections' | 'oauth_tokens' | 'profiles'
    >;
    Views: Record<string, never>;
    Functions: Pick<Database['public']['Functions'], 'get_mcp_environment_identity_v2'>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type McpAccessSupabaseClient = SupabaseClient<McpAccessDatabase>;

export function createMcpAccessDbClient(): McpAccessSupabaseClient {
  return createClient<McpAccessDatabase>(
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
