import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { databaseTables, type Database, type Row } from '@/lib/database';
import { logger } from '@/lib/logger';
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

// PostgREST の 1 リクエスト行数上限（`supabase/config.toml` の `api.max_rows`）と同じ値。
// `list()` はこれを超える件数のユーザーでもページングして越えて取得する（#1903:
// max_rows 到達で 1000 件目以降が silent に切り捨てられ revoke できなくなる問題）。
const MCP_LIST_PAGE_SIZE = 1000;

// ページング cap。`create_oauth_authorization_grant_v2` は同一 (user_id, client_id) を
// 重複挿入しうるため、authorize ループ等のバグで connection が無制限に積み上がる異常系が
// ありうる。cap 無しだと異常データに対して無制限に fetch し続ける DoS になるため必ず置く。
// 通常運用は 1 ユーザー数件〜十数件なので、ここまで見えれば人間が原因を特定して
// 個別 revoke できる規模として 10,000 件（10 ページ）を上限にする。
const MCP_LIST_MAX_PAGES = 10;

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

  /**
   * 自分の有効な（未 revoke の）MCP connection 一覧。認可の新しい順。
   *
   * PostgREST の `max_rows`（`MCP_LIST_PAGE_SIZE`）を超えるユーザーでも「見えている
   * connection は revoke できる」前提を壊さないよう、内部でページングして
   * `MCP_LIST_MAX_PAGES` まで全件取得する。router / UI はページングを意識しない
   * （戻り値の型は 1 ページ取得時と変わらない）。
   */
  async list(userId: string): Promise<McpConnectionSummary[]> {
    const byId = new Map<string, McpConnectionSummary>();
    let totalCount: number | null = null;
    // ページ上限まで回り切った場合だけ true のまま残る。0 件ページ・総数到達・
    // 未充足ページのいずれかで正常終了した場合は false になる。
    let cappedByPageLimit = true;

    for (let page = 0; page < MCP_LIST_MAX_PAGES; page++) {
      const from = page * MCP_LIST_PAGE_SIZE;
      const to = from + MCP_LIST_PAGE_SIZE - 1;

      const { data, count, error } = await this.supabase
        .from(databaseTables.oauthConnections)
        .select(MCP_CONNECTION_PUBLIC_COLUMNS, { count: 'exact' })
        .eq('user_id', userId) // RLS (auth.uid() = user_id) と併用する defense-in-depth
        .is('revoked_at', null)
        .order('authorized_at', { ascending: false })
        // `authorized_at` は一意でない（DEFAULT now()、index も (user_id, authorized_at DESC)
        // だけで tiebreaker が無い）。offset ページングで同値の行が page 境界を跨ぐと、
        // 2 回目のクエリで tie の並びが変わり、既読の行を再取得する代わりに別の行が
        // 落ちうる。落ちた connection は一覧に出ない = revoke できないので、id で全順序に
        // する（#1903 が潰そうとしている故障そのもの）。
        .order('id', { ascending: false })
        .range(from, to);

      if (error) {
        const original = captureUnexpectedDatabaseError(error, {
          feature: 'mcp_connections',
          operation: 'list_connections',
        });
        throw new McpConnectionsServiceError('FETCH_FAILED', 'Failed to fetch MCP connections', {
          cause: original,
        });
      }

      // 1 ページ目の count を総数として採用する（以降のページの count は無視してよい、
      // PostgREST は毎回同じ集計を返す）。
      if (totalCount === null) totalCount = count;

      const pageRows = data ?? [];
      // 重複を含んだ件数で総数判定すると、重複の分だけ「取得済み」が水増しされて
      // 未取得の行を残したまま break する。dedupe 後の件数で判定する。
      for (const row of pageRows) {
        if (!byId.has(row.id)) byId.set(row.id, row);
      }

      if (pageRows.length === 0) {
        cappedByPageLimit = false;
        break; // これ以上ページが無い
      }
      if (totalCount !== null && byId.size >= totalCount) {
        cappedByPageLimit = false;
        break; // 総数まで取得済み
      }
      if (pageRows.length < MCP_LIST_PAGE_SIZE) {
        cappedByPageLimit = false;
        break; // count が信頼できなくても、ページが未充足なら最終ページ
      }
    }

    const deduped = [...byId.values()];

    if (cappedByPageLimit) {
      // cap に到達してもなお切り捨てず、取得済み分は返す（例外にしない ＝ revoke 導線を
      // 殺さない）。まだ残っている行があることだけをログで可視化する。
      logger.warn('MCP connection list hit the page cap', {
        feature: 'mcp_connections',
        operation: 'list_connections',
        returned: deduped.length,
        total: totalCount,
        cap: MCP_LIST_MAX_PAGES * MCP_LIST_PAGE_SIZE,
      });
    }

    return deduped;
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
