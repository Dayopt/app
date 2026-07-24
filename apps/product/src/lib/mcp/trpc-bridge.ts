import 'server-only';

import type { OAuthClientId, SupportedScope } from '@/lib/oauth-server';
import { createServiceRoleClient } from '@/lib/supabase/oauth';
import { appRouter } from '@/lib/trpc/root';

/**
 * MCP tool から tRPC procedure を呼ぶための薄い bridge。
 *
 * `proProcedure` の Pro gate と `protectedProcedure` の userId 注入を再利用するため、
 * MCP tool は service 層を直 import せずこの caller を経由する
 * (docs/projects/mcp-server/overview.md Decision 9)。
 *
 * 認証は `authMode: 'oauth'` でセットされるので proProcedure 側が毎リクエスト
 * profiles.subscription_status を DB lookup する (Decision 1)。
 */
interface McpTrpcContextInput {
  userId: string;
  clientId: OAuthClientId;
  scopes: SupportedScope[];
  signal?: AbortSignal;
}

export function createMcpTrpcCaller(input: McpTrpcContextInput) {
  const supabase = createServiceRoleClient();

  return appRouter.createCaller({
    req: {
      headers: {},
      cookies: {},
      ...(input.signal ? { signal: input.signal } : {}),
    },
    res: {},
    userId: input.userId,
    oauthClientId: input.clientId,
    oauthScopes: input.scopes,
    oauthExecution: 'mcp_internal',
    supabase,
    authMode: 'oauth',
  });
}
