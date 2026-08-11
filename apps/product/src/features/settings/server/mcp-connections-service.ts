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

// 1 ページの件数。UI が同期 render できる規模（#1909: 数千行の一括 render で
// ConfirmDialog 導線ごと使えなくなる問題）と、PostgREST `max_rows`（1000）の
// どちらよりも十分小さく取る。全件到達は keyset cursor の「もっと見る」で担保する。
const MCP_LIST_PAGE_SIZE = 50;

// tRPC 経由の consumer は `RouterOutputs['mcpConnections']['list']['items']` で推論する
// （`external-calendar/server/connection-service.ts` の `CalendarConnectionSummary` と
// 同じ方針）。この型は再 export しない。
type McpConnectionSummary = Pick<
  Row<'oauth_connections'>,
  'id' | 'client_id' | 'scopes' | 'authorized_at' | 'last_used_at'
>;

/**
 * keyset cursor。`(authorized_at DESC, id DESC)` の全順序上の「最後に返した行」を指す。
 * `authorizedAt` は DB が返した `authorized_at` の生値をそのまま往復させる
 * （`new Date().toISOString()` を経由するとマイクロ秒精度が落ち、同一ミリ秒内の
 * 行が次ページで欠落・重複する）。
 */
type McpConnectionListCursor = {
  authorizedAt: string;
  id: string;
};

// cursor は client 由来の値を PostgREST の `.or()` 文字列へ埋め込む（repo 内で client
// 入力を `.or()` へ流すのはここが初）。`,` や `()` は `.or()` の構文文字なので、
// timestamptz / uuid の厳格な形だけを allowlist で通す（router の zod 検証との二重化）。
const TIMESTAMPTZ_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidCursor(cursor: McpConnectionListCursor): boolean {
  return TIMESTAMPTZ_PATTERN.test(cursor.authorizedAt) && UUID_PATTERN.test(cursor.id);
}

export class McpConnectionsServiceError extends ServiceError {
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(code, message, options);
    this.name = 'McpConnectionsServiceError';
  }
}

export class McpConnectionsService {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  /**
   * 自分の有効な（未 revoke の）MCP connection 一覧を 1 ページ返す。認可の新しい順。
   *
   * `(authorized_at DESC, id DESC)` の keyset cursor でページングする。offset ページングは
   * ページ取得の合間に行が増減すると境界がずれて行を取りこぼす（= 一覧に出ない connection は
   * revoke できない、#1903 が潰そうとしている故障）が、keyset は「最後に返した行より後ろ」を
   * 直接指すためこれが起きない。全件到達は UI の「もっと見る」が担う（#1909）。
   */
  async list(
    userId: string,
    cursor?: McpConnectionListCursor | null,
  ): Promise<{ items: McpConnectionSummary[]; nextCursor: McpConnectionListCursor | null }> {
    if (cursor && !isValidCursor(cursor)) {
      // 到達しうるのは改竄された client か、router の zod と service の allowlist が
      // 食い違った時だけ。`.or()` へ渡す前に必ず落とす。
      throw new McpConnectionsServiceError('INVALID_INPUT', 'Invalid MCP connection cursor');
    }

    let query = this.supabase
      .from(databaseTables.oauthConnections)
      .select(MCP_CONNECTION_PUBLIC_COLUMNS)
      .eq('user_id', userId) // RLS (auth.uid() = user_id) と併用する defense-in-depth
      .is('revoked_at', null);

    if (cursor) {
      // `(authorized_at, id) < (cursor.authorizedAt, cursor.id)` を PostgREST で表す。
      // 複合比較の直接構文が無いため、「authorized_at がより古い」か
      // 「authorized_at が同値で id がより小さい」の論理和に展開する。
      // `and(...)` を省いて `authorized_at.eq.X,id.lt.Y` と書くと OR の項が 3 つに
      // ばらけ、同値でない行まで id 比較だけで通ってしまう。
      query = query.or(
        `authorized_at.lt.${cursor.authorizedAt},and(authorized_at.eq.${cursor.authorizedAt},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await query
      .order('authorized_at', { ascending: false })
      // `authorized_at` は一意でない（DEFAULT now()、index も (user_id, authorized_at DESC)
      // だけで tiebreaker が無い）。tiebreaker が無いと同値の行の並びが呼び出しごとに
      // 変わり、cursor が指す位置が定まらずに行を取りこぼす（一覧に出ない connection は
      // revoke できない = #1903 が潰そうとしている故障そのもの）。
      .order('id', { ascending: false })
      // 次ページの有無を数えるために 1 件多く取る（N+1 trick）。余分な 1 件は返さない。
      .limit(MCP_LIST_PAGE_SIZE + 1);

    if (error) {
      const original = captureUnexpectedDatabaseError(error, {
        feature: 'mcp_connections',
        operation: 'list_connections',
      });
      throw new McpConnectionsServiceError('FETCH_FAILED', 'Failed to fetch MCP connections', {
        cause: original,
      });
    }

    const rows = data ?? [];
    const hasMore = rows.length > MCP_LIST_PAGE_SIZE;
    const items = hasMore ? rows.slice(0, MCP_LIST_PAGE_SIZE) : rows;
    const lastRow = items[items.length - 1];
    // cursor には DB が返した生値をそのまま入れる。Date を経由して再整形すると
    // マイクロ秒が落ち、同一ミリ秒内の行が次ページで欠落・重複する。
    const nextCursor =
      hasMore && lastRow ? { authorizedAt: lastRow.authorized_at, id: lastRow.id } : null;

    if (!cursor && nextCursor) {
      // 1 ページ目が満杯 = 通常運用（1 ユーザー数件〜十数件）から外れた蓄積。
      // 旧実装の cap 到達 warn の後継として、異常蓄積ユーザーの検知経路を残す
      // （総数を出す count クエリは足さない。ページングの目的は軽量化なので）。
      logger.warn('MCP connection list exceeded a single page', {
        feature: 'mcp_connections',
        operation: 'list_connections',
        pageSize: MCP_LIST_PAGE_SIZE,
      });
    }

    return { items, nextCursor };
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
