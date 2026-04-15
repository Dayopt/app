// Notification types for Dayopt notification system
// Authoritative types are in @/schemas/notifications (Zod schemas)

export type { NotificationType } from './schemas';

import type { NotificationType } from './schemas';

/** Supabase から取得する通知エンティティ（entries JOIN データ含む） */
export interface NotificationEntity {
  id: string;
  user_id: string;
  type: NotificationType;
  entry_id: string | null;
  title: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  fire_at: string | null;
  created_at: string;
  entries?: { title: string } | null;
}

/** クライアント側で扱う通知型（camelCase に変換済み） */
export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  entryId?: string | undefined;
  entryTitle?: string | undefined;
  isRead: boolean;
  readAt?: Date | undefined;
  fireAt?: Date | undefined;
  createdAt: Date;
}
