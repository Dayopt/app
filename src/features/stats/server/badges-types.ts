/**
 * Badge Service Types
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

/** バッジサービスが使用する Supabase クライアント型 */
export type ServiceSupabaseClient = SupabaseClient<Database>;
