import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { databaseTables, type Database, type Row } from '@/lib/database';
import { captureUnexpectedDatabaseError } from '@/lib/sentry';
import { ServiceError } from '@/lib/trpc/errors';

/**
 * Settings 画面向けの MCP connection 一覧行。
 *
 * `oauth_connections` は authenticated に SELECT のみ許可（RLS: `auth.uid() = user_id`）。
 * token 値・token 識別子はこのテーブルに元々存在せず（`oauth_tokens` 側）、この select は
 * それに加えて内部管理列（`resource_uri` / `consent_version` / `reauth_required_at` /
 * `write_enabled_at` / `legacy_read_only` / `revoked_*`）も明示的に外す。
 */
const MCP_CONNECTION_PUBLIC_COLUMNS = 'id, client_id, scopes, authorized_at, last_used_at' as const;

// tRPC 経由の consumer は `RouterOutputs['mcpConnections']['list']` で推論する
// （`external-calendar/server/connection-service.ts` の `CalendarConnectionSummary` と
// 同じ方針）。この型は再 export しない。
type McpConnectionSummary = Pick<
  Row<'oauth_connections'>,
  'id' | 'client_id' | 'scopes' | 'authorized_at' | 'last_used_at'
>;

export class McpConnectionsServiceError extends ServiceError {
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(code, message, options);
    this.name = 'McpConnectionsServiceError';
  }
}

export class McpConnectionsService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  /** 自分の有効な（未 revoke の）MCP connection 一覧。認可の新しい順。 */
  async list(userId: string): Promise<McpConnectionSummary[]> {
    const { data, error } = await this.supabase
      .from(databaseTables.oauthConnections)
      .select(MCP_CONNECTION_PUBLIC_COLUMNS)
      .eq('user_id', userId) // RLS (auth.uid() = user_id) と併用する defense-in-depth
      .is('revoked_at', null)
      .order('authorized_at', { ascending: false });

    if (error) {
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'mcp_connections',
        operation: 'list_connections',
      });
      throw new McpConnectionsServiceError('FETCH_FAILED', 'Failed to fetch MCP connections', {
        cause: original,
      });
    }

    return data ?? [];
  }

  /**
   * 自分の connection を revoke する。`revoke_oauth_connection` RPC は内部で
   * `auth.uid()` を検証するため、他人の connection・存在しない connection は
   * どちらも false を返す（区別しない。列挙攻撃で存在確認をさせない）。
   *
   * `userId` は RPC 側の `auth.uid()` に対する二重化。RPC 単独でも境界は閉じるが、
   * 将来 `ctx.supabase` が service-role client へ変わると `auth.uid()` が NULL になり
   * DB 側の境界だけが消える（`list` は `.eq('user_id')` が残るのに `revoke` は素通り、
   * という非対称を作らない）。
   */
  async revoke(userId: string, connectionId: string): Promise<void> {
    const { data: owned, error: lookupError } = await this.supabase
      .from(databaseTables.oauthConnections)
      .select('id')
      .eq('id', connectionId)
      .eq('user_id', userId)
      .maybeSingle();

    if (lookupError) {
      const original = captureUnexpectedDatabaseError(lookupError, {
        feature: 'mcp_connections',
        operation: 'revoke_connection_lookup',
      });
      throw new McpConnectionsServiceError('REVOKE_FAILED', 'Failed to revoke MCP connection', {
        cause: original,
      });
    }

    if (!owned) {
      throw new McpConnectionsServiceError('NOT_FOUND', 'MCP connection not found');
    }

    const { data, error } = await this.supabase.rpc('revoke_oauth_connection', {
      p_connection_id: connectionId,
    });

    if (error) {
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'mcp_connections',
        operation: 'revoke_connection',
      });
      throw new McpConnectionsServiceError('REVOKE_FAILED', 'Failed to revoke MCP connection', {
        cause: original,
      });
    }

    if (!data) {
      throw new McpConnectionsServiceError('NOT_FOUND', 'MCP connection not found');
    }
  }
}

export function createMcpConnectionsService(
  supabase: SupabaseClient<Database>,
): McpConnectionsService {
  return new McpConnectionsService(supabase);
}
