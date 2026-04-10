/**
 * 通知データ取得・操作用カスタムフック
 *
 * @description
 * tRPC APIとの統合。キャッシュ戦略とリトライ設定を適用。
 *
 * @example
 * ```typescript
 * const { data: notifications, isLoading } = useNotificationsList()
 * const { markAsRead } = useNotificationMutations()
 * ```
 */

import { cacheStrategies } from '@/lib/tanstack-query/cache-config';
import { api } from '@/lib/trpc';

/**
 * 通知一覧取得
 *
 * @param params - フィルタパラメータ
 * @param params.is_read - 既読状態でフィルタ
 * @param params.limit - 取得件数上限
 */
export function useNotificationsList(params?: { is_read?: boolean; limit?: number }) {
  return api.notifications.list.useQuery(params, {
    ...cacheStrategies.notifications,
    retry: 1,
  });
}

/**
 * 未読数取得
 *
 * @remarks
 * ヘッダーのバッジ表示に使用。リアルタイム性が重要。
 */
export function useUnreadCount() {
  return api.notifications.unreadCount.useQuery(undefined, {
    ...cacheStrategies.notifications,
    retry: 1,
    refetchInterval: 60 * 1000, // 1分ごとに自動更新
  });
}

/**
 * 通知詳細取得
 *
 * @param id - 通知ID
 */
export function useNotification(id: string) {
  return api.notifications.getById.useQuery(
    { id },
    {
      ...cacheStrategies.notifications,
      retry: 1,
      enabled: !!id,
    },
  );
}

/**
 * 通知操作（既読化・削除）- 楽観的更新付き
 *
 * @returns mutation関数群
 */
export function useNotificationMutations() {
  const utils = api.useUtils();

  /**
   * キャッシュ無効化（通知関連の全クエリ）
   */
  const invalidateNotifications = () => {
    void utils.notifications.list.invalidate();
    void utils.notifications.unreadCount.invalidate();
  };

  // 既読にする（楽観的更新付き）
  const markAsRead = api.notifications.markAsRead.useMutation({
    onMutate: async ({ id }) => {
      await utils.notifications.list.cancel();
      await utils.notifications.unreadCount.cancel();

      const previousList = utils.notifications.list.getData();
      const previousCount = utils.notifications.unreadCount.getData();

      // 通知を既読にマーク
      utils.notifications.list.setData(undefined, (old) => {
        if (!old) return old;
        return old.map((n) => (n.id === id ? { ...n, is_read: true } : n));
      });

      // 未読数を減らす
      utils.notifications.unreadCount.setData(undefined, (old) => {
        if (old === undefined) return old;
        return Math.max(0, old - 1);
      });

      return { previousList, previousCount };
    },
    onError: (_err, _input, context) => {
      if (context?.previousList) {
        utils.notifications.list.setData(undefined, context.previousList);
      }
      if (context?.previousCount !== undefined) {
        utils.notifications.unreadCount.setData(undefined, context.previousCount);
      }
    },
    onSettled: invalidateNotifications,
  });

  // 全て既読にする（楽観的更新付き）
  const markAllAsRead = api.notifications.markAllAsRead.useMutation({
    onMutate: async () => {
      await utils.notifications.list.cancel();
      await utils.notifications.unreadCount.cancel();

      const previousList = utils.notifications.list.getData();
      const previousCount = utils.notifications.unreadCount.getData();

      // 全通知を既読にマーク
      utils.notifications.list.setData(undefined, (old) => {
        if (!old) return old;
        return old.map((n) => ({ ...n, is_read: true }));
      });

      // 未読数を0に
      utils.notifications.unreadCount.setData(undefined, () => 0);

      return { previousList, previousCount };
    },
    onError: (_err, _input, context) => {
      if (context?.previousList) {
        utils.notifications.list.setData(undefined, context.previousList);
      }
      if (context?.previousCount !== undefined) {
        utils.notifications.unreadCount.setData(undefined, context.previousCount);
      }
    },
    onSettled: invalidateNotifications,
  });

  // 通知削除（楽観的更新付き）
  const deleteNotification = api.notifications.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.notifications.list.cancel();
      await utils.notifications.unreadCount.cancel();

      const previousList = utils.notifications.list.getData();
      const previousCount = utils.notifications.unreadCount.getData();

      // 削除対象が未読かどうかを確認
      const deletedNotification = previousList?.find((n) => n.id === id);
      const wasUnread = deletedNotification && !deletedNotification.is_read;

      // 通知をリストから削除
      utils.notifications.list.setData(undefined, (old) => {
        if (!old) return old;
        return old.filter((n) => n.id !== id);
      });

      // 未読だった場合は未読数を減らす
      if (wasUnread) {
        utils.notifications.unreadCount.setData(undefined, (old) => {
          if (old === undefined) return old;
          return Math.max(0, old - 1);
        });
      }

      return { previousList, previousCount };
    },
    onError: (_err, _input, context) => {
      if (context?.previousList) {
        utils.notifications.list.setData(undefined, context.previousList);
      }
      if (context?.previousCount !== undefined) {
        utils.notifications.unreadCount.setData(undefined, context.previousCount);
      }
    },
    onSettled: invalidateNotifications,
  });

  // 既読を全て削除（楽観的更新付き）
  const deleteAllRead = api.notifications.deleteAllRead.useMutation({
    onMutate: async () => {
      await utils.notifications.list.cancel();

      const previousList = utils.notifications.list.getData();

      // 既読の通知をリストから削除
      utils.notifications.list.setData(undefined, (old) => {
        if (!old) return old;
        return old.filter((n) => !n.is_read);
      });

      return { previousList };
    },
    onError: (_err, _input, context) => {
      if (context?.previousList) {
        utils.notifications.list.setData(undefined, context.previousList);
      }
    },
    onSettled: invalidateNotifications,
  });

  return {
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllRead,
  };
}
