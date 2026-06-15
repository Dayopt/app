'use client';

import { useCallback, useEffect, useState } from 'react';

import { useUpdateUserSettings } from '@/lib/hooks/useUpdateUserSettings';
import { api } from '@/lib/trpc';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

interface UsePaymentErrorDialogResult {
  open: boolean;
  close: () => void;
}

/**
 * 24時間経過しているかを判定する純粋関数
 */
function isOverdue(lastShownAt: string | null, now: number): boolean {
  if (!lastShownAt) return true;
  const elapsed = now - new Date(lastShownAt).getTime();
  return elapsed >= TWENTY_FOUR_HOURS_MS;
}

/**
 * 決済エラーダイアログの表示判定 + 再表示管理
 *
 * 表示条件（すべて満たす場合のみ）:
 * 1. subscriptionStatus === 'past_due'
 * 2. paymentErrorDialogLastShownAt が null、または 24 時間以上前
 *
 * close() を呼ぶと現在時刻を personalization に保存し、
 * 次回は最短 24 時間後に再表示される。
 */
export function usePaymentErrorDialog(): UsePaymentErrorDialogResult {
  const [open, setOpen] = useState(false);

  const billingQuery = api.billing.getOverview.useQuery(undefined, {
    retry: false,
  });
  const settingsQuery = api.userSettings.get.useQuery();
  const updateSettings = useUpdateUserSettings();

  // データ取得完了後に表示判定（effect 内なので Date.now() が使える）
  // past_due から active 等へ遷移した場合は dialog を閉じ、stale な表示を残さない
  useEffect(() => {
    const billing = billingQuery.data?.billingInfo;
    const settings = settingsQuery.data;

    if (!billing || settings === undefined) return;

    const shouldOpen =
      billing.subscriptionStatus === 'past_due' &&
      isOverdue(settings?.personalization.paymentErrorDialogLastShownAt ?? null, Date.now());

    // eslint-disable-next-line react-hooks/set-state-in-effect -- データ取得完了後の1回限りの判定
    setOpen(shouldOpen);
  }, [billingQuery.data, settingsQuery.data]);

  const close = useCallback(() => {
    setOpen(false);
    updateSettings.mutate({ paymentErrorDialogLastShownAt: new Date().toISOString() });
  }, [updateSettings]);

  return { open, close };
}
