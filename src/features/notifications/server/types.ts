/**
 * Notification Service Types
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';

/** 通知サービスが使用する Supabase クライアント型 */
export type ServiceSupabaseClient = SupabaseClient<Database>;

/** notifications テーブルの行型 */
export type NotificationRow = Database['public']['Tables']['notifications']['Row'];

/** 通知一覧取得オプション */
export interface ListNotificationsOptions {
  userId: string;
  isRead?: boolean;
  type?: string;
  limit?: number;
  offset?: number;
}

/** 通知作成オプション */
export interface CreateNotificationOptions {
  userId: string;
  type: string;
  /** entry_id */
  entryId: string;
}

/** 通知更新オプション */
export interface UpdateNotificationOptions {
  userId: string;
  notificationId: string;
  isRead?: boolean;
  readAt?: string | null;
}

/** 一括既読化オプション */
export interface MarkAllAsReadOptions {
  userId: string;
  type?: string;
}

/** 通知一括削除オプション */
export interface DeleteNotificationsOptions {
  userId: string;
  ids: string[];
}
