'use client';

import { useCallback, useMemo } from 'react';

import { useTranslations } from 'next-intl';

import { useServiceWorker } from '@/lib/hooks/useServiceWorker';
import { useSyncStatus } from '@/lib/hooks/useSyncStatus';

import type { InlineBannerAction } from '@/lib/components/ui/inline-banner';

interface InlineBannerState {
  visible: boolean;
  message: string;
  action?: InlineBannerAction;
}

/**
 * InlineBanner の表示状態を管理するフック
 *
 * 優先度（高→低）:
 * 1. 同期エラー（データ損失リスク）
 * 2. コンフリクト検出（未実装）
 * 3. オフライン中（操作制限）
 * 4. アプリ更新あり（緊急性低）
 */
export function useInlineBanner(): InlineBannerState {
  const t = useTranslations('common.inlineBanner');
  const { failedCount, isOnline } = useSyncStatus();
  const { updateAvailable, applyUpdate } = useServiceWorker();

  const retrySync = useCallback(async () => {
    const { getAll, updateEntry } = await import('@/lib/pwa/sync-queue');
    const { processQueue } = await import('@/lib/pwa/sync-processor');

    const entries = await getAll();
    const failed = entries.filter((e) => e.status === 'failed');

    for (const entry of failed) {
      await updateEntry(entry.id, { status: 'pending', retryCount: 0 });
    }

    await processQueue();
  }, []);

  return useMemo(() => {
    // Priority 1: 同期エラー
    if (failedCount > 0) {
      return {
        visible: true,
        message: t('syncError'),
        action: { label: t('retry'), onClick: retrySync },
      };
    }

    // Priority 2: コンフリクト検出（将来実装）

    // Priority 3: オフライン
    if (!isOnline) {
      return {
        visible: true,
        message: t('offline'),
      };
    }

    // Priority 4: アプリ更新
    if (updateAvailable) {
      return {
        visible: true,
        message: t('updateAvailable'),
        action: { label: t('update'), onClick: applyUpdate },
      };
    }

    return { visible: false, message: '' };
  }, [failedCount, isOnline, updateAvailable, t, retrySync, applyUpdate]);
}
