import { z } from 'zod';

/** 通知タイプのZodスキーマ（リマインダー + AI通知） */
export const notificationTypeSchema = z.enum([
  'reminder',
  'ai_insight',
  'weekly_report',
  'burnout_warning',
  'energy_insight',
]);

/** 通知作成リクエストのZodスキーマ */
export const createNotificationSchema = z.object({
  type: notificationTypeSchema,
  title: z.string().min(1),
  entry_id: z.string().uuid().optional(),
  fire_at: z.string().datetime().optional(),
  data: z.record(z.unknown()).optional(),
});

/** 通知更新（既読化など）のZodスキーマ */
export const updateNotificationSchema = z.object({
  read_at: z.string().datetime().nullable().optional(),
});

/** 通知IDのZodスキーマ */
export const notificationIdSchema = z.object({
  id: z.string().uuid('validation.invalidUuid'),
});

/** 通知一覧取得オプションのZodスキーマ */
export const listNotificationsSchema = z.object({
  unread_only: z.boolean().optional(),
  type: notificationTypeSchema.optional(),
  limit: z.number().min(1).max(100).optional().default(50),
  offset: z.number().min(0).optional().default(0),
});

/** 一括既読化リクエストのZodスキーマ */
export const markAllAsReadSchema = z.object({
  type: notificationTypeSchema.optional(),
});

/** 通知一括削除リクエストのZodスキーマ */
export const deleteNotificationsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});

/** 通知タイプの型 */
export type NotificationType = z.infer<typeof notificationTypeSchema>;
/** 通知作成リクエストの型 */
export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
/** 通知更新リクエストの型 */
export type UpdateNotificationInput = z.infer<typeof updateNotificationSchema>;
/** 通知一覧取得オプションの型 */
export type ListNotificationsInput = z.infer<typeof listNotificationsSchema>;
/** 一括既読化リクエストの型 */
export type MarkAllAsReadInput = z.infer<typeof markAllAsReadSchema>;
/** 通知一括削除リクエストの型 */
export type DeleteNotificationsInput = z.infer<typeof deleteNotificationsSchema>;
