'use client';

import { useEffect, useRef } from 'react';

import { WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { useIsMutating } from '@tanstack/react-query';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { logger } from '@/lib/logger';

/**
 * オフライン状態インジケーター
 *
 * ネットワーク切断時に画面上部に固定バナーを表示。
 * 復帰時は自動的に非表示になり、pending mutationsの同期状況を通知。
 */
export function OfflineIndicator() {
  const t = useTranslations();
  const isOnline = useOnlineStatus();
  const wasOfflineRef = useRef(false);
  const mutatingCount = useIsMutating();

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      logger.warn('[OfflineIndicator] Network connection lost');
    } else if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      logger.info('[OfflineIndicator] Network connection restored');

      // 復帰時にpending mutationsがあれば同期通知
      if (mutatingCount > 0) {
        toast.info(t('common.status.syncing', { count: mutatingCount }), {
          id: 'offline-sync',
          duration: 3000,
        });
      }
    }
  }, [isOnline, mutatingCount, t]);

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="alert"
      className="bg-destructive text-destructive-foreground flex items-center justify-center gap-2 px-4 py-2 text-center text-sm"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>{t('common.status.offline')}</span>
    </div>
  );
}
