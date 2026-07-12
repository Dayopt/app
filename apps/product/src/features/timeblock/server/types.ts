/**
 * Service Types
 *
 * サービス層で使用する共通型定義
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database';

/**
 * サービス関数で使用するSupabaseクライアント型
 */
export type ServiceSupabaseClient = SupabaseClient<Database>;
