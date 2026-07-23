import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/env';
import type { Database } from '@/lib/database';

/** Service-role surface restricted to typed MCP mutation RPCs. */
type NoDatabaseObjects = { [_ in never]: never };

type McpMutationDatabase = {
  public: {
    Tables: NoDatabaseObjects;
    Views: NoDatabaseObjects;
    Functions: Pick<
      Database['public']['Functions'],
      | 'apply_mcp_plan_create_v1'
      | 'apply_mcp_plan_delete_v1'
      | 'apply_mcp_plan_restore_v1'
      | 'apply_mcp_plan_update_v1'
    >;
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
type GeneratedPlanUpdateRpcArgs =
  Database['public']['Functions']['apply_mcp_plan_update_v1']['Args'];
type PlanUpdateRpcArgs = Omit<
  GeneratedPlanUpdateRpcArgs,
  'p_end_at' | 'p_note' | 'p_start_at' | 'p_tag_id' | 'p_title'
> & {
  p_end_at: string | null;
  p_note: string | null;
  p_start_at: string | null;
  p_tag_id: string | null;
  p_title: string | null;
};
type PlanDeleteRpcArgs = Database['public']['Functions']['apply_mcp_plan_delete_v1']['Args'];
type PlanRestoreRpcArgs = Database['public']['Functions']['apply_mcp_plan_restore_v1']['Args'];

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
    applyPlanCreate: async (args: PlanCreateRpcArgs) => {
      const { data, error } = await client.rpc('apply_mcp_plan_create_v1', {
        ...args,
        p_note: args.p_note as never,
        p_tag_id: args.p_tag_id as never,
      });
      return { data, error };
    },
    applyPlanUpdate: async (args: PlanUpdateRpcArgs) => {
      const { data, error } = await client.rpc('apply_mcp_plan_update_v1', {
        ...args,
        p_end_at: args.p_end_at as never,
        p_note: args.p_note as never,
        p_start_at: args.p_start_at as never,
        p_tag_id: args.p_tag_id as never,
        p_title: args.p_title as never,
      });
      return { data, error };
    },
    applyPlanDelete: async (args: PlanDeleteRpcArgs) => {
      const { data, error } = await client.rpc('apply_mcp_plan_delete_v1', args);
      return { data, error };
    },
    applyPlanRestore: async (args: PlanRestoreRpcArgs) => {
      const { data, error } = await client.rpc('apply_mcp_plan_restore_v1', args);
      return { data, error };
    },
  };
}
