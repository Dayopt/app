'use client';

import { useEffect, useMemo, useState } from 'react';

import { useTranslations } from 'next-intl';

import { toast } from '@/lib/toast';
import { api } from '@/lib/trpc';

import {
  BILLING_POLL_INTERVAL_MS,
  BILLING_POLL_MAX_DURATION_MS,
  getBillingOperationErrorPresentation,
  shouldContinueBillingPoll,
  useBillingPollStore,
  useStableBillingOperation,
} from '@/features/settings';

import type { InlineBannerAction } from '@dayopt/components';

interface InlineBannerState {
  visible: boolean;
  message: string;
  action?: InlineBannerAction;
}

/**
 * InlineBanner の app-level composition フック
 *
 * feature 層の billing 状態（past_due）を合成する。
 *
 * 優先度（高→低）:
 * 1. 決済エラー（Pro失効リスク）
 */
export function useAppInlineBanner(): InlineBannerState {
  const t = useTranslations();
  const [billingActionClosed, setBillingActionClosed] = useState(false);
  const {
    begin: beginPortalAttempt,
    isLocked: isPortalAttemptLocked,
    settle: settlePortalAttempt,
  } = useStableBillingOperation();

  // Checkout 成功復帰直後（settings/[category]/page.tsx が useBillingPollStore を
  // start する）だけ短い間隔で再取得する。webhook 経由の subscription_status 反映が
  // invalidate に追いつかないケースの救済（issue #1887）。この hook は app shell に
  // 常駐するため、settings modal の開閉に関係なくポーリングを継続できる。
  const pollStartedAt = useBillingPollStore.use.startedAt();
  const stopBillingPoll = useBillingPollStore.use.stop();

  const billingQuery = api.billing.getOverview.useQuery(undefined, {
    retry: false,
    refetchInterval: (query) => {
      if (pollStartedAt === null) return false;
      const status = query.state.data?.billingInfo.subscriptionStatus;
      return shouldContinueBillingPoll({ startedAt: pollStartedAt, subscriptionStatus: status })
        ? BILLING_POLL_INTERVAL_MS
        : false;
    },
  });

  useEffect(() => {
    if (pollStartedAt === null) return;
    const status = billingQuery.data?.billingInfo.subscriptionStatus;
    if (!shouldContinueBillingPoll({ startedAt: pollStartedAt, subscriptionStatus: status })) {
      stopBillingPoll();
      return;
    }
    // webhook 未達のまま data が変化しないと、この effect は再実行されず
    // startedAt が残って「反映中」表示が消えない。refetchInterval の自然停止とは
    // 別に、打ち切り時刻（+ 最終 refetch の着地猶予 1 interval）で必ず stop する
    const remainingMs = BILLING_POLL_MAX_DURATION_MS - (Date.now() - pollStartedAt);
    const timer = setTimeout(stopBillingPoll, Math.max(remainingMs, 0) + BILLING_POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [billingQuery.data, pollStartedAt, stopBillingPoll]);
  const createPortal = api.billing.createPortalSession.useMutation({
    onSuccess(data, variables) {
      if (!variables) return;
      if (data?.url && settlePortalAttempt(variables.operationId, 'terminal')) {
        window.location.href = data.url;
      }
    },
    onError(error, variables) {
      if (!variables) return;
      const { closesBillingActions, messageKey, retryable } =
        getBillingOperationErrorPresentation(error);
      const isCurrent = settlePortalAttempt(
        variables.operationId,
        retryable ? 'retryable' : 'terminal',
      );
      if (!isCurrent) return;

      if (closesBillingActions) setBillingActionClosed(true);
      toast.error(t(messageKey));
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

    return { visible: false, message: '' };
  }, [beginPortalAttempt, billingActionClosed, createPortal, isPastDue, isPortalAttemptLocked, t]);
}
