// Notification types for Dayopt notification system
// Authoritative types are in @/schemas/notifications (Zod schemas)

export type { NotificationType } from './schemas';

import type { NotificationType } from './schemas';

/** Supabase から取得する通知エンティティ（entries JOIN データ含む） */
export interface NotificationEntity {
  id: string;
  user_id: string;
  type: NotificationType;
  plan_id: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  plans?: { title: string } | null;
}

/** クライアント側で扱う通知型（camelCase に変換済み） */
export interface Notification {
  id: string;
  type: NotificationType;
  planId?: string | undefined;
  planTitle?: string | undefined;
  isRead: boolean;
  readAt?: Date | undefined;
  createdAt: Date;
}
