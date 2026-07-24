import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/env';
import type { Database } from '@/lib/database';
import { databaseTables } from '@/lib/database';

import { encryptToken } from './token-crypto';

/**
 * `calendar_connections` への書き込み。
 *
 * authenticated は column-scoped SELECT しか持たない（`refresh_token_enc` /
 * `granted_scopes` / `provider_account_id` は grant 外）ので、mutation は必ず
 * service_role で行い、`user_id` を明示的に指定する。設計は overview.md §4-4。
 */

/**
 * service-role client が触れる surface を connection 系だけに narrow する。
 * `lib/oauth-server/db.ts` と同じ理由 — RLS を bypass する client が他テーブルへ
 * 到達できると cross-tenant leak になるので、compile error で止める。
 */
type CalendarConnectionDatabase = {
  public: {
    Tables: Pick<
      Database['public']['Tables'],
      'calendar_connections' | 'calendar_connection_calendars'
    >;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type CalendarConnectionClient = SupabaseClient<CalendarConnectionDatabase>;

function createCalendarConnectionDbClient(): CalendarConnectionClient {
  return createClient<CalendarConnectionDatabase>(
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

const GOOGLE_PROVIDER = 'google';

type SaveConnectionInput = {
  userId: string;
  /** Google の `sub`。email は可変・再利用可なので同定には使わない。 */
  providerAccountId: string;
  providerAccountEmail: string | null;
  grantedScopes: string[];
  refreshToken: string;
  encryptionKey: string;
};

/**
 * 接続を保存する。
 *
 * `refresh_token` が返らなかった場合はこの関数を呼ばない。既存行を残したまま
 * `status='active'` に戻すと、失効済みの token を抱えた接続が UI 上「接続済み」に見え、
 * 再認証導線が二度と出なくなる（overview.md §5-4 の reauth_required 遷移が死ぬ）。
 */
export async function saveConnection(input: SaveConnectionInput): Promise<void> {
  const db = createCalendarConnectionDbClient();

  const { error } = await db.from(databaseTables.calendarConnections).upsert(
    {
      user_id: input.userId,
      provider: GOOGLE_PROVIDER,
      provider_account_id: input.providerAccountId,
      provider_account_email: input.providerAccountEmail,
      granted_scopes: input.grantedScopes,
      refresh_token_enc: encryptToken(input.refreshToken, input.encryptionKey),
      status: 'active',
      last_sync_error: null,
    },
    { onConflict: 'user_id,provider,provider_account_id' },
  );

  if (error) {
    // error にトークンは含まれないが、message をそのまま外へ出さない。
    throw new Error(`failed to save calendar connection: ${error.code ?? 'unknown'}`);
  }
}
