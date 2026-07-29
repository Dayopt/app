'use client';

import { useMemo, useState } from 'react';

import { useTranslations } from 'next-intl';

import { toast } from '@/lib/toast';
import { api } from '@/lib/trpc';

import {
  getBillingOperationErrorDisposition,
  useStableBillingOperation,
} from '@/features/settings';
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
  const t = useTranslations();
  const base = useInlineBanner();
  const [billingActionClosed, setBillingActionClosed] = useState(false);
  const {
    begin: beginPortalAttempt,
    isLocked: isPortalAttemptLocked,
    settle: settlePortalAttempt,
  } = useStableBillingOperation();

  const billingQuery = api.billing.getOverview.useQuery(undefined, {
    retry: false,
  });
  const createPortal = api.billing.createPortalSession.useMutation({
    onSuccess(data, variables) {
      if (!variables) return;
      if (data?.url && settlePortalAttempt(variables.operationId, 'terminal')) {
        window.location.href = data.url;
      }
    },
    onError(error, variables) {
      if (!variables) return;
      const disposition = getBillingOperationErrorDisposition(error);
      const isCurrent = settlePortalAttempt(
        variables.operationId,
        disposition === 'retryable' ? 'retryable' : 'terminal',
      );
      if (!isCurrent) return;

      if (disposition === 'account_closing') {
        setBillingActionClosed(true);
        toast.error(t('common.billingOperation.accountClosing'));
      } else if (disposition === 'terminal') {
        toast.error(t('common.billingOperation.restart'));
      } else {
        toast.error(t('common.billingOperation.retryable'));
      }
    },
  });

  const isPastDue = billingQuery.data?.billingInfo.subscriptionStatus === 'past_due';

  return useMemo(() => {
    // Priority 1: 決済エラー
    if (isPastDue) {
      return {
        visible: true,
        message: billingActionClosed
          ? t('common.billingOperation.accountClosing')
          : t('common.inlineBanner.paymentError'),
        action: {
          disabled: billingActionClosed || createPortal.isPending || isPortalAttemptLocked,
          label: t('common.inlineBanner.checkPayment'),
          onClick: () => {
            const operationId = beginPortalAttempt();
            if (operationId) createPortal.mutate({ operationId });
          },
        },
      };
    }

    // Priority 2: Service Worker 更新
    return base;
  }, [
    base,
    beginPortalAttempt,
    billingActionClosed,
    createPortal,
    isPastDue,
    isPortalAttemptLocked,
    t,
  ]);
}
