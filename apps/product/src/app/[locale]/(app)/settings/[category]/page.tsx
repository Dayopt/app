'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';

import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { AppHeader } from '@/components/shell/AppHeader';
import {
  parseCalendarCallbackResult,
  removeCalendarCallbackParams,
  type CalendarCallbackError,
} from '@/features/external-calendar';
import {
  isValidCategory,
  SETTINGS_CATEGORIES,
  SettingsContent,
  useBillingPollStore,
} from '@/features/settings';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { useHasMounted } from '@/lib/hooks/useHasMounted';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useShellStore } from '@/lib/stores/useShellStore';
import { toast } from '@/lib/toast';
import { api } from '@/lib/trpc';
import { Button } from '@dayopt/components';
import { Link, useRouter } from '@dayopt/i18n/navigation';

import { parseBillingReturn, removeBillingReturnParams } from '../_utils/billing-return';
import {
  buildSettingsReturnQuery,
  DESKTOP_SETTINGS_EXIT_PATH,
  normalizeSettingsReturnPath,
} from '../_utils/settings-return';

/**
 * 設定カテゴリページ
 *
 * PC: ホームにリダイレクトし、設定モーダルを開く
 * Mobile: ヘッダー（戻るボタン）+ コンテンツ
 */
export default function SettingsCategoryPage() {
  const params = useParams<{ category: string }>();
  const hasMounted = useHasMounted();
  const t = useTranslations();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const router = useRouter();
  const searchParams = useSearchParams();
  const openSettings = useShellStore((s) => s.openSettings);
  const utils = api.useUtils();
  const processedCallback = useRef<string | null>(null);

  const category = params?.category ?? 'general';
  const isValid = isValidCategory(category);
  const rawReturnTo = searchParams.get('returnTo');
  const settingsIndexHref = rawReturnTo
    ? `/settings${buildSettingsReturnQuery(normalizeSettingsReturnPath(rawReturnTo))}`
    : '/settings';
  const calendarParam = searchParams.get('calendar');
  const reasonParam = searchParams.get('reason');
  const searchParamsString = searchParams.toString();
  // Stripe Checkout / Customer Portal からの復帰。PC は下の openSettings + replace で
  // query が消えるため、BillingSettings 側ではなくここで先に処理する
  // （Calendar の OAuth callback と同じ理由・同じ形）。
  const billingReturn = category === 'billing' ? parseBillingReturn(searchParams) : null;
  const callbackResult = useMemo(() => {
    const callbackParams = new URLSearchParams();
    if (calendarParam) callbackParams.set('calendar', calendarParam);
    if (reasonParam) callbackParams.set('reason', reasonParam);
    return parseCalendarCallbackResult(callbackParams);
  }, [calendarParam, reasonParam]);

  // OAuth callback の feedback / cache 更新を PC redirect より先に一元処理する。
  useEffect(() => {
    if (!hasMounted || !isValid) return;

    if (callbackResult) {
      const callbackKey = `${calendarParam ?? ''}:${reasonParam ?? ''}`;
      if (processedCallback.current === callbackKey) return;
      processedCallback.current = callbackKey;

      if (callbackResult.type === 'connected') {
        toast.success(t('settings.integrations.googleCalendar.callback.connected'));
      } else {
        toast.error(calendarCallbackErrorMessage(t, callbackResult.error));
      }
      void utils.externalCalendar.listConnections.invalidate();

      if (!isMobile) {
        openSettings('integrations');
        router.replace(DESKTOP_SETTINGS_EXIT_PATH);
        return;
      }

      const cleanParams = removeCalendarCallbackParams(new URLSearchParams(searchParamsString));
      const query = cleanParams.size > 0 ? `?${cleanParams.toString()}` : '';
      router.replace(`/settings/integrations${query}`);
      return;
    }

    if (billingReturn) {
      const callbackKey = `billing:${billingReturn}`;
      if (processedCallback.current === callbackKey) return;
      processedCallback.current = callbackKey;

      // Checkout の結果だけ知らせる。Portal からの復帰は通知するイベントではない
      if (billingReturn !== 'portal') {
        toast.success(
          t(
            billingReturn === 'checkout_success'
              ? 'settings.subscription.checkoutSuccess'
              : 'settings.subscription.checkoutCanceled',
          ),
        );
      }
      // Checkout / Portal のどちらでも課金状態は変わりうる。query cache は IndexedDB へ
      // 永続化され staleTime 5 分は fresh 扱いのため、invalidate しないと外部遷移前の
      // 値がそのまま復元されて解約やプラン変更が反映されない
      void utils.billing.getOverview.invalidate();

      // Checkout 成功直後は subscription_status の webhook 反映が invalidate に
      // 追いつかず、再取得しても古い free が返りうる（issue #1887）。この場合だけ
      // 有限ポーリングを開始する（useAppInlineBanner 側の billing.getOverview query
      // が startedAt を見て refetchInterval を有効化する）。
      if (billingReturn === 'checkout_success') {
        useBillingPollStore.getState().start();
      }

      if (!isMobile) {
        openSettings(category);
        router.replace(DESKTOP_SETTINGS_EXIT_PATH);
        return;
      }

      const cleanParams = removeBillingReturnParams(new URLSearchParams(searchParamsString));
      const query = cleanParams.size > 0 ? `?${cleanParams.toString()}` : '';
      router.replace(`/settings/billing${query}`);
      return;
    }

    if (!isMobile) {
      openSettings(category);
      router.replace(DESKTOP_SETTINGS_EXIT_PATH);
    }
  }, [
    billingReturn,
    callbackResult,
    calendarParam,
    category,
    hasMounted,
    isMobile,
    isValid,
    openSettings,
    reasonParam,
    router,
    searchParamsString,
    t,
    utils.billing.getOverview,
    utils.externalCalendar.listConnections,
  ]);

  if (!isValid) {
    return null;
  }

  // PC: リダイレクト中は何も表示しない
  if (!hasMounted || !isMobile) {
    return null;
  }

  const categoryMeta = SETTINGS_CATEGORIES.find((c) => c.id === category);

  // Mobile: ヘッダー付き
  return (
    <>
      <AppHeader
        leftSlot={
          <Button variant="ghost" size="sm" icon asChild className="-ml-2">
            <Link href={settingsIndexHref} aria-label={t('common.back')}>
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
        }
      >
        <h1 className="text-lg font-medium">{categoryMeta ? t(categoryMeta.labelKey) : ''}</h1>
      </AppHeader>
      <SettingsContent category={category} />
    </>
  );
}

function calendarCallbackErrorMessage(
  t: ReturnType<typeof useTranslations<never>>,
  error: CalendarCallbackError,
): string {
  switch (error) {
    case 'access_denied':
      return t('settings.integrations.googleCalendar.callback.accessDenied');
    case 'account_mismatch':
      return t('settings.integrations.googleCalendar.callback.accountMismatch');
    case 'authorization_expired':
      return t('settings.integrations.googleCalendar.callback.authorizationExpired');
    case 'pro_required':
      return t('settings.integrations.googleCalendar.callback.proRequired');
    case 'rate_limited':
      return t('settings.integrations.googleCalendar.callback.rateLimited');
    case 'reconnect_target_invalid':
      return t('settings.integrations.googleCalendar.callback.reconnectTargetInvalid');
    case 'mfa_verification_required':
      return t('settings.integrations.googleCalendar.callback.mfaVerificationRequired');
    case 'unavailable':
      return t('settings.integrations.googleCalendar.callback.unavailable');
    case 'generic':
      return t('settings.integrations.googleCalendar.callback.genericError');
  }
}
