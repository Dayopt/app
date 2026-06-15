'use client';

import { useCallback, useMemo, useState } from 'react';

import { useUpdateUserSettings } from '@/lib/hooks/useUpdateUserSettings';
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
 * close() は UI を即座に閉じる（local state で optimistic dismiss）、
 * 裏で personalization に dismissedTrialEndedDialog: true を保存する。
 * 失敗時も local dismiss は保持し、ユーザーがダイアログに閉じ込められないようにする。
 */
export function useTrialEndedDialog(): UseTrialEndedDialogResult {
  const billingQuery = api.billing.getOverview.useQuery(undefined, {
    retry: false,
  });
  const settingsQuery = api.userSettings.get.useQuery();
  const updateSettings = useUpdateUserSettings();

  const [locallyDismissed, setLocallyDismissed] = useState(false);

  const close = useCallback(() => {
    setLocallyDismissed(true);
    updateSettings.mutate({ dismissedTrialEndedDialog: true });
  }, [updateSettings]);

  const open = useMemo(() => {
    if (locallyDismissed) return false;

    const billing = billingQuery.data?.billingInfo;
    const settings = settingsQuery.data;

    if (!billing || settings === undefined) return false;

    return (
      billing.subscriptionStatus === 'free' &&
      billing.stripeCustomerId !== null &&
      !settings?.personalization.dismissedTrialEndedDialog
    );
  }, [billingQuery.data, settingsQuery.data, locallyDismissed]);

  return { open, close };
}
