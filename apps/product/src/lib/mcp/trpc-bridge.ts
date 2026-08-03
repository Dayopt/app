import 'server-only';

import type { OAuthClientId, SupportedScope } from '@/lib/oauth-server';
import { createServiceRoleClient } from '@/lib/supabase/oauth';
import { appRouter } from '@/lib/trpc/root';

/**
 * MCP tool から tRPC procedure を呼ぶための薄い bridge。
 *
 * protected procedureのuserId注入とfeature ownershipを再利用するため、MCP toolは
 * service層を直importせずこのcallerを経由する。MCP全体のPro gateは、このbridgeより
 * 前のprotected-resource境界で毎request検査する。
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
