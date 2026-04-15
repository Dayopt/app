import { describe, expect, it } from 'vitest';

import type { NotificationEntity } from '../types';

import { transformNotificationEntities, transformNotificationEntity } from './transformers';

describe('transformers', () => {
  describe('transformNotificationEntity', () => {
    it('NotificationEntityをNotificationに変換できる', () => {
      const entity: NotificationEntity = {
        id: 'notif-1',
        user_id: 'user-1',
        type: 'reminder',
        entry_id: 'plan-1',
        title: 'ミーティングのリマインダー',
        data: null,
        read_at: null,
        fire_at: null,
        created_at: '2025-01-01T00:00:00Z',
        entries: { title: 'ミーティング' },
      };

      const result = transformNotificationEntity(entity);

      expect(result.id).toBe('notif-1');
      expect(result.type).toBe('reminder');
      expect(result.title).toBe('ミーティングのリマインダー');
      expect(result.entryId).toBe('plan-1');
      expect(result.entryTitle).toBe('ミーティング');
      expect(result.isRead).toBe(false);
      expect(result.readAt).toBeUndefined();
      expect(result.fireAt).toBeUndefined();
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('nullの値はundefinedに変換される', () => {
      const entity: NotificationEntity = {
        id: 'notif-1',
        user_id: 'user-1',
        type: 'reminder',
        entry_id: null,
        title: 'リマインダー',
        data: null,
        read_at: '2025-01-02T00:00:00Z',
        fire_at: null,
        created_at: '2025-01-01T00:00:00Z',
        entries: null,
      };

      const result = transformNotificationEntity(entity);

      expect(result.entryId).toBeUndefined();
      expect(result.entryTitle).toBeUndefined();
      expect(result.isRead).toBe(true);
      expect(result.readAt).toBeInstanceOf(Date);
    });

    it('fire_atがある場合はDateに変換される', () => {
      const entity: NotificationEntity = {
        id: 'notif-1',
        user_id: 'user-1',
        type: 'reminder',
        entry_id: 'plan-1',
        title: 'リマインダー',
        data: { key: 'value' },
        read_at: null,
        fire_at: '2025-01-01T09:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
        entries: null,
      };

      const result = transformNotificationEntity(entity);

      expect(result.fireAt).toBeInstanceOf(Date);
    });
  });

  describe('transformNotificationEntities', () => {
    it('複数のエンティティを変換できる', () => {
      const entities: NotificationEntity[] = [
        {
          id: 'notif-1',
          user_id: 'user-1',
          type: 'reminder',
          entry_id: 'plan-1',
          title: 'タスクAのリマインダー',
          data: null,
          read_at: null,
          fire_at: null,
          created_at: '2025-01-01T00:00:00Z',
          entries: { title: 'タスクA' },
        },
        {
          id: 'notif-2',
          user_id: 'user-1',
          type: 'ai_insight',
          entry_id: 'plan-2',
          title: 'インサイト',
          data: null,
          read_at: '2025-01-02T12:00:00Z',
          fire_at: null,
          created_at: '2025-01-02T00:00:00Z',
          entries: { title: 'タスクB' },
        },
      ];

      const result = transformNotificationEntities(entities);

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('notif-1');
      expect(result[0]?.isRead).toBe(false);
      expect(result[1]?.id).toBe('notif-2');
      expect(result[1]?.isRead).toBe(true);
    });

    it('空配列を処理できる', () => {
      const result = transformNotificationEntities([]);

      expect(result).toEqual([]);
    });
  });
});
