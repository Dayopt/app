// Supabase service client ファクトリ
// Edge Function 全体で共通の createServiceClient() を提供

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * service_role key を使用した Supabase クライアントを作成
 * RLS をバイパスしてシステム操作を実行する用途
 */
export function createServiceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, key);
}
