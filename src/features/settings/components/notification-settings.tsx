'use client';

import { useTranslations } from 'next-intl';

import { LabeledRow } from '@/lib/components/common/LabeledRow';
import { SectionCard } from '@/lib/components/common/SectionCard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/lib/components/ui/select';
import { Skeleton } from '@/lib/components/ui/skeleton';
import { handleMutationError } from '@/lib/errors/handle-mutation-error';
import { api } from '@/lib/trpc';

/** 通知設定コンポーネント。メール言語設定を管理する */
export function NotificationSettings() {
  const t = useTranslations();

  const { data: userSettings, isLoading } = api.userSettings.get.useQuery();

  const utils = api.useUtils();
  const updateUserSettings = api.userSettings.update.useMutation({
    // 楽観的更新: Select の値は query cache から読むため、onMutate で即時反映しないと
    // server 往復分（数百 ms）UI が旧値を出し続ける。失敗時は rollback。
    onMutate: async (variables) => {
      await utils.userSettings.get.cancel();
      const previous = utils.userSettings.get.getData();
      if (previous && variables.preferredLocale !== undefined) {
        utils.userSettings.get.setData(undefined, {
          ...previous,
          preferredLocale: variables.preferredLocale,
        });
      }
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        utils.userSettings.get.setData(undefined, context.previous);
      }
      handleMutationError(error, {
        fallback: t('notification.settings.saveError', { message: '' }),
        scope: 'settings.notification.update',
      });
    },
    onSettled: () => {
      utils.userSettings.get.invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6 sm:space-y-8">
        <SectionCard>
          <div className="space-y-4">
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <SectionCard>
        <LabeledRow
          label={t('notification.settings.emailLanguage.label')}
          description={t('notification.settings.emailLanguage.description')}
        >
          <Select
            value={userSettings?.preferredLocale ?? 'en'}
            onValueChange={(value: 'en' | 'ja') => {
              updateUserSettings.mutate({ preferredLocale: value });
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t('notification.settings.emailLanguage.en')}</SelectItem>
              <SelectItem value="ja">{t('notification.settings.emailLanguage.ja')}</SelectItem>
            </SelectContent>
          </Select>
        </LabeledRow>
      </SectionCard>

      {/* ヒント情報 */}
      <div className="bg-card border-border-subtle rounded-lg border p-4 shadow-sm">
        <p className="text-muted-foreground text-base md:text-sm">
          {t('notification.settings.tip')}
        </p>
      </div>
    </div>
  );
}
