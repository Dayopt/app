import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/env';
import type { Database } from '@/lib/database';

/** Service-role surface restricted to typed MCP mutation RPCs. */
type NoDatabaseObjects = { [_ in never]: never };

export type McpMutationDatabase = {
  public: {
    Tables: NoDatabaseObjects;
    Views: NoDatabaseObjects;
    Functions: Pick<Database['public']['Functions'], 'apply_mcp_plan_create_v1'>;
    Enums: NoDatabaseObjects;
    CompositeTypes: NoDatabaseObjects;
  };
};

type McpMutationDbClient = SupabaseClient<McpMutationDatabase>;
type GeneratedPlanCreateRpcArgs =
  Database['public']['Functions']['apply_mcp_plan_create_v1']['Args'];
type PlanCreateRpcArgs = Omit<GeneratedPlanCreateRpcArgs, 'p_note' | 'p_tag_id'> & {
  p_note: string | null;
  p_tag_id: string | null;
};

function createMcpMutationDbClient(): McpMutationDbClient {
  return createClient<McpMutationDatabase>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: (url, options) =>
          fetch(url, {
            ...options,
            signal: options?.signal ?? AbortSignal.timeout(15_000),
          }),
      },
    },
  );
}

/** Exposes typed apply methods without exposing the underlying service-role client. */
export function createMcpMutationDb() {
  const client = createMcpMutationDbClient();

  return {
    applyPlanCreate: (args: PlanCreateRpcArgs) =>
      client.rpc('apply_mcp_plan_create_v1', {
        ...args,
        p_note: args.p_note as never,
        p_tag_id: args.p_tag_id as never,
      }),
  };
}
