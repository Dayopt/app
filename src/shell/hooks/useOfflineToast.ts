'use client';

import { useEffect, useRef } from 'react';

import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';

import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';

/**
 * オフライン/オンライン切り替え時にtoast通知を表示するフック
 *
 * - オフラインに切り替わった時: 警告toast（操作はキューに保存される旨を通知）
 * - オンラインに復帰した時: 成功toast（同期が開始される旨を通知）
 */
export function useOfflineToast(): void {
  const isOnline = useOnlineStatus();
  const t = useTranslations('common.sync');
  const prevOnlineRef = useRef(isOnline);

  useEffect(() => {
    // 初回レンダリングでは通知しない
    if (prevOnlineRef.current === isOnline) return;
    prevOnlineRef.current = isOnline;

    if (!isOnline) {
      toast.warning(t('offlineToast'), {
        duration: 5000,
        id: 'offline-status',
      });
    } else {
      toast.success(t('onlineToast'), {
        duration: 3000,
        id: 'offline-status',
      });
    }
  }, [isOnline, t]);
}
