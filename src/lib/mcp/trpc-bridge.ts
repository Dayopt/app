import 'server-only';

import * as Sentry from '@sentry/nextjs';

import type { OAuthClientId, SupportedScope } from '@/lib/oauth-server';
import { createServiceRoleClient } from '@/lib/supabase/oauth';
import { appRouter } from '@/lib/trpc/root';

/**
 * MCP tool から tRPC procedure を呼ぶための薄い bridge。
 *
 * `proProcedure` の Pro gate と `protectedProcedure` の userId 注入を再利用するため、
 * MCP tool は service 層を直 import せずこの caller を経由する
 * (docs/design/mcp-server/overview.md Decision 9)。
 *
 * 認証は `authMode: 'oauth'` でセットされるので proProcedure 側が毎リクエスト
 * profiles.subscription_status を DB lookup する (Decision 1)。
 */
export interface McpTrpcContextInput {
  userId: string;
  clientId: OAuthClientId;
  scopes: SupportedScope[];
}

export function createMcpTrpcCaller(input: McpTrpcContextInput) {
  const supabase = createServiceRoleClient();
  Sentry.setTag('mcp.client_id', input.clientId);
  Sentry.setUser({ id: input.userId });

  return appRouter.createCaller({
    req: { headers: {}, cookies: {} },
    res: {},
    userId: input.userId,
    supabase,
    authMode: 'oauth',
  });
}
