'use client';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { useTranslations } from 'next-intl';

import { toast } from '@/lib/toast';
import { api, type AppRouter } from '@/lib/trpc';

type UserSettingsData = inferRouterOutputs<AppRouter>['userSettings']['get'];
type UserSettingsUpdateInput = inferRouterInputs<AppRouter>['userSettings']['update'];

function createDefaultSettings(): NonNullable<UserSettingsData> {
  return {
    timezone:
      typeof window === 'undefined' ? 'UTC' : Intl.DateTimeFormat().resolvedOptions().timeZone,
    timeFormat: '24h',
    weekStartsOn: 1,
    showWeekends: true,
    showWeekNumbers: false,
    defaultDuration: 60,
    snapInterval: 15,
    defaultView: 'week',
    hourHeightDensity: 'default',
    theme: 'system',
    personalization: {
      dismissedTrialEndedDialog: false,
      paymentErrorDialogLastShownAt: null,
    },
    preferredLocale: 'en',
  };
}

function applyOptimisticUpdate(
  current: UserSettingsData | undefined,
  input: UserSettingsUpdateInput,
): UserSettingsData {
  const settings = current ?? createDefaultSettings();
  const updates = Object.fromEntries(
    Object.entries(input).filter(
      ([key, value]) =>
        value !== undefined &&
        key !== 'dismissedTrialEndedDialog' &&
        key !== 'paymentErrorDialogLastShownAt',
    ),
  ) as Partial<NonNullable<UserSettingsData>>;
  return {
    ...settings,
    ...updates,
    personalization: {
      ...settings.personalization,
      ...(input.dismissedTrialEndedDialog !== undefined && {
        dismissedTrialEndedDialog: input.dismissedTrialEndedDialog,
      }),
      ...(input.paymentErrorDialogLastShownAt !== undefined && {
        paymentErrorDialogLastShownAt: input.paymentErrorDialogLastShownAt,
      }),
    },
  };
}

/**
 * user_settings更新の共通規約。
 * onMutateでcacheを更新し、onErrorでrollback、onSettledでserver stateを再検証する。
 * callsiteでは追加のinvalidateを書かず、このhookへ集約する。
 */
export function useUpdateUserSettings() {
  const t = useTranslations();
  const utils = api.useUtils();

  return api.userSettings.update.useMutation({
    onMutate: async (input) => {
      await utils.userSettings.get.cancel();
      const previous = utils.userSettings.get.getData();
      utils.userSettings.get.setData(undefined, (current) => applyOptimisticUpdate(current, input));
      return { previous };
    },
    onError: (_error, _input, context) => {
      utils.userSettings.get.setData(undefined, context?.previous);
      toast.error(t('settings.common.saveFailed'));
    },
    onSuccess: (_data, input) => {
      if (typeof input.timezone === 'string') {
        document.cookie = `user-tz=${input.timezone};path=/;max-age=31536000;SameSite=Lax`;
      }
    },
    onSettled: (_data, _error, input) => {
      void utils.userSettings.get.invalidate();
      if (typeof input.timezone === 'string') {
        void utils.plans.invalidate();
        void utils.records.invalidate();
        void utils.statistics.invalidate();
      }
    },
  });
}
