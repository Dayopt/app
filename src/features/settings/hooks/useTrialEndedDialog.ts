'use client';

import { useCallback, useMemo } from 'react';

import { api } from '@/lib/trpc';

interface UseTrialEndedDialogResult {
  open: boolean;
  close: () => void;
}

/**
 * Trial終了ダイアログの表示判定 + フラグ管理
 *
 * 表示条件（すべて満たす場合のみ）:
 * 1. subscriptionStatus === 'free'
 * 2. stripeCustomerId が存在する（= Trial を経験した）
 * 3. dismissedTrialEndedDialog フラグが false
 *
 * close() を呼ぶと personalization に dismissedTrialEndedDialog: true を保存し、
 * 以降のセッションでは表示されない。
 */
export function useTrialEndedDialog(): UseTrialEndedDialogResult {
  const billingQuery = api.billing.getOverview.useQuery(undefined, {
    retry: false,
  });
  const settingsQuery = api.userSettings.get.useQuery();
  const updateSettings = api.userSettings.update.useMutation();
  const utils = api.useUtils();

  const close = useCallback(() => {
    updateSettings.mutate(
      { dismissedTrialEndedDialog: true },
      {
        onSuccess: () => {
          utils.userSettings.get.invalidate();
        },
      },
    );
  }, [updateSettings, utils]);

  const open = useMemo(() => {
    const billing = billingQuery.data?.billingInfo;
    const settings = settingsQuery.data;

    if (!billing || settings === undefined) return false;

    return (
      billing.subscriptionStatus === 'free' &&
      billing.stripeCustomerId !== null &&
      !settings?.personalization.dismissedTrialEndedDialog
    );
  }, [billingQuery.data, settingsQuery.data]);

  return { open, close };
}
