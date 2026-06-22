'use client';

import { useMemo } from 'react';

import { useTranslations } from 'next-intl';

import { useServiceWorker } from '@/lib/hooks/useServiceWorker';

import type { InlineBannerAction } from '@dayopt/components';

interface InlineBannerState {
  visible: boolean;
  message: string;
  action?: InlineBannerAction;
}

/**
 * InlineBanner の表示状態を管理するフック
 *
 * Service Worker の更新が利用可能な場合にバナーを表示する。
 */
export function useInlineBanner(): InlineBannerState {
  const t = useTranslations('common.inlineBanner');
  const { updateAvailable, applyUpdate } = useServiceWorker();

  return useMemo(() => {
    if (updateAvailable) {
      return {
        visible: true,
        message: t('updateAvailable'),
        action: { label: t('update'), onClick: applyUpdate },
      };
    }

    return { visible: false, message: '' };
  }, [updateAvailable, t, applyUpdate]);
}
