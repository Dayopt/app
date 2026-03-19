'use client';

import { useEffect } from 'react';

import { setAppBadge } from '@/lib/pwa/app-badge';

import { useUnreadCount } from './useNotificationsData';

/**
 * 通知の未読数をPWAアプリバッジに反映するフック
 *
 * useUnreadCount() の値が変わるたびに navigator.setAppBadge() を更新。
 * PWAとしてインストールされていない場合は何もしない（内部でガード済み）。
 */
export function useNotificationBadge(): void {
  const { data: unreadCount } = useUnreadCount();

  useEffect(() => {
    // undefinedの場合（まだロード中）はスキップ
    if (unreadCount === undefined) return;
    setAppBadge(unreadCount);
  }, [unreadCount]);
}
