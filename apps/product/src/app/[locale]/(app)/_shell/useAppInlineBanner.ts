'use client';

import { useMemo } from 'react';

import { useTranslations } from 'next-intl';

import { api } from '@/lib/trpc';

import { useInlineBanner } from '@/lib/hooks/useInlineBanner';

import type { InlineBannerAction } from '@dayopt/components';

interface InlineBannerState {
  visible: boolean;
  message: string;
  action?: InlineBannerAction;
}

/**
 * InlineBanner の app-level composition フック
 *
 * lib 層の Service Worker 更新状態に、
 * feature 層の billing 状態（past_due）を合成する。
 *
 * 優先度（高→低）:
 * 1. 決済エラー（Pro失効リスク）
 * 2. アプリ更新あり（緊急性低）
 */
export function useAppInlineBanner(): InlineBannerState {
  const t = useTranslations('common.inlineBanner');
  const base = useInlineBanner();

  const billingQuery = api.billing.getOverview.useQuery(undefined, {
    retry: false,
  });
  const createPortal = api.billing.createPortalSession.useMutation({
    onSuccess(data) {
      if (data?.url) {
        window.location.href = data.url;
      }
    },
  });

  const isPastDue = billingQuery.data?.billingInfo.subscriptionStatus === 'past_due';

  return useMemo(() => {
    // Priority 1: 決済エラー
    if (isPastDue) {
      return {
        visible: true,
        message: t('paymentError'),
        action: {
          label: t('checkPayment'),
          onClick: () => createPortal.mutate(),
        },
      };
    }

    // Priority 2: Service Worker 更新
    return base;
  }, [base, isPastDue, t, createPortal]);
}
