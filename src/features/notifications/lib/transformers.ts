import type { Notification, NotificationEntity } from '../types';

/**
 * NotificationEntity (DB) → Notification (Client) 変換
 */
export function transformNotificationEntity(entity: NotificationEntity): Notification {
  return {
    id: entity.id,
    type: entity.type,
    title: entity.title,
    entryId: entity.entry_id ?? undefined,
    entryTitle: entity.entries?.title ?? undefined,
    isRead: entity.read_at !== null,
    readAt: entity.read_at ? new Date(entity.read_at) : undefined,
    fireAt: entity.fire_at ? new Date(entity.fire_at) : undefined,
    createdAt: new Date(entity.created_at),
  };
}

/**
 * NotificationEntity配列 → Notification配列 変換
 */
export function transformNotificationEntities(entities: NotificationEntity[]): Notification[] {
  return entities.map(transformNotificationEntity);
}
