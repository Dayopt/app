'use client';

import { useMemo } from 'react';

import { useTranslations } from 'next-intl';

import { api } from '@/lib/trpc';

import { useInlineBanner } from '@/lib/hooks/useInlineBanner';

import type { InlineBannerAction } from '@/lib/components/ui/inline-banner';

interface InlineBannerState {
  visible: boolean;
  message: string;
  action?: InlineBannerAction;
}

/**
 * InlineBanner の app-level composition フック
 *
 * lib 層の useInlineBanner（sync/offline/update）に加え、
 * feature 層の billing 状態（past_due）を合成する。
 *
 * 優先度（高→低）:
 * 1. 同期エラー（データ損失リスク）
 * 2. 決済エラー（Pro失効リスク）
 * 3. コンフリクト検出（未実装）
 * 4. オフライン中（操作制限）
 * 5. アプリ更新あり（緊急性低）
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
    // base hook handles priority 1 (sync error) internally.
    // If sync error is active, it takes precedence over payment error.
    if (base.visible && base.message === t('syncError')) {
      return base;
    }

    // Priority 2: 決済エラー
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

    // Priority 3-5: base hook handles the rest (offline, update)
    return base;
  }, [base, isPastDue, t, createPortal]);
}
