/**
 * Supabase Realtime通知購読フック
 * 新しい通知をリアルタイムで検知してToast表示・ブラウザ通知
 */

'use client';

import { useEffect, useRef } from 'react';

import { createClient } from '@/platform/supabase/client';
import { trpc } from '@/platform/trpc/client';
import { toast } from 'sonner';
import type { NotificationType } from '../schemas';

import {
  checkBrowserNotificationSupport,
  showBrowserNotification,
} from '../utils/notification-helpers';

import { useNotificationPreferences } from './useNotificationPreferences';

interface NotificationPayload {
  id: string;
  type: NotificationType;
  entry_id: string | null;
  created_at: string;
  user_id: string;
}

/**
 * Supabase Realtime で通知の INSERT を購読し、Toast・ブラウザ通知を表示するフック
 * @param userId - 購読対象のユーザーID（undefined の場合は購読しない）
 * @param enabled - false にすると購読を無効化（デフォルト: true）
 */
export function useNotificationRealtime(userId: string | undefined, enabled = true) {
  const utils = trpc.useUtils();
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);

  // 通知設定を取得
  const { enableBrowserNotifications } = useNotificationPreferences();

  useEffect(() => {
    if (!enabled || !userId) return;

    const supabase = createClient();

    // Realtimeチャンネルを購読
    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const notification = payload.new as NotificationPayload;

          if (!enableBrowserNotifications) {
            // ブラウザ通知が無効の場合はキャッシュのみ更新
            utils.notifications.list.invalidate();
            utils.notifications.unreadCount.invalidate();
            return;
          }

          // entry titleをtRPCキャッシュから取得
          const cachedList = utils.notifications.list.getData();
          const cachedNotification = cachedList?.find(
            (n) => 'entry_id' in n && n.entry_id === notification.entry_id,
          );
          const planTitle =
            cachedNotification && 'entries' in cachedNotification
              ? (cachedNotification.entries as { title: string } | null)?.title
              : undefined;

          const toastTitle = planTitle ?? notification.type;

          // Toast表示
          toast.info(toastTitle, {
            duration: 5000,
          });

          // ブラウザ通知を表示
          if (checkBrowserNotificationSupport() && Notification.permission === 'granted') {
            showBrowserNotification(toastTitle, {
              tag: notification.id,
            });
          }

          // tRPCキャッシュを無効化して最新データを取得
          utils.notifications.list.invalidate();
          utils.notifications.unreadCount.invalidate();
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [userId, enabled, utils, enableBrowserNotifications]);
}
