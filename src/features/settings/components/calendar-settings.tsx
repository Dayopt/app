'use client';

import { useCallback } from 'react';

import { useTranslations } from 'next-intl';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

import { useUserSettings } from '../hooks/useUserSettings';

import { LabeledRow } from '@/components/common/LabeledRow';
import { SectionCard } from '@/components/common/SectionCard';

/**
 * カレンダー設定コンポーネント
 *
 * デフォルトビュー、スナップ間隔、デフォルトタスク時間、
 * 週番号/週末表示の設定を管理
 *
 * タイムゾーン・日付/時間形式・週の開始日は GeneralSettings に移動済み
 */
export function CalendarSettings() {
  const { settings, saveSettings, isPending } = useUserSettings();
  const t = useTranslations();

  const handleShowWeekNumbersChange = useCallback(
    (checked: boolean) => {
      saveSettings({ showWeekNumbers: checked });
    },
    [saveSettings],
  );

  const handleShowWeekendsChange = useCallback(
    (checked: boolean) => {
      saveSettings({ showWeekends: checked });
    },
    [saveSettings],
  );

  const handleDefaultDurationChange = useCallback(
    (value: string) => {
      saveSettings({ defaultDuration: Number(value) });
    },
    [saveSettings],
  );

  const handleSnapIntervalChange = useCallback(
    (value: string) => {
      saveSettings({ snapInterval: Number(value) as 5 | 10 | 15 | 30 });
    },
    [saveSettings],
  );

  const handleDefaultViewChange = useCallback(
    (value: string) => {
      saveSettings({ defaultView: value as 'day' | '3day' | '5day' | 'week' });
    },
    [saveSettings],
  );

  if (isPending) {
    return (
      <div className="space-y-8">
        {Array.from({ length: 2 }, (_, i) => (
          <SectionCard key={i}>
            <div className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </SectionCard>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Default View Section */}
      <SectionCard title={t('settings.calendar.defaultViewSection')}>
        <LabeledRow label={t('settings.calendar.defaultView')}>
          <Select value={settings.defaultView} onValueChange={handleDefaultViewChange}>
            <SelectTrigger variant="ghost">
              <SelectValue placeholder={t('settings.calendar.selectDefaultView')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">{t('settings.calendar.viewDay')}</SelectItem>
              <SelectItem value="3day">{t('settings.calendar.view3Day')}</SelectItem>
              <SelectItem value="5day">{t('settings.calendar.view5Day')}</SelectItem>
              <SelectItem value="week">{t('settings.calendar.viewWeek')}</SelectItem>
            </SelectContent>
          </Select>
        </LabeledRow>
      </SectionCard>

      {/* Display Section */}
      <SectionCard title={t('settings.calendar.weekAndCalendar')}>
        <LabeledRow label={t('settings.calendar.showWeekNumbers')}>
          <Switch
            checked={settings.showWeekNumbers}
            onCheckedChange={handleShowWeekNumbersChange}
          />
        </LabeledRow>
        <LabeledRow label={t('settings.calendar.showWeekends')}>
          <Switch checked={settings.showWeekends} onCheckedChange={handleShowWeekendsChange} />
        </LabeledRow>
      </SectionCard>

      {/* Default Task Settings Section */}
      <SectionCard title={t('settings.calendar.defaultTaskSettings')}>
        <LabeledRow label={t('settings.calendar.defaultDuration')}>
          <Select
            value={String(settings.defaultDuration)}
            onValueChange={handleDefaultDurationChange}
          >
            <SelectTrigger variant="ghost">
              <SelectValue placeholder={t('settings.calendar.selectDuration')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">{t('settings.calendar.duration15min')}</SelectItem>
              <SelectItem value="30">{t('settings.calendar.duration30min')}</SelectItem>
              <SelectItem value="60">{t('settings.calendar.duration1hour')}</SelectItem>
              <SelectItem value="90">{t('settings.calendar.duration1hour30min')}</SelectItem>
              <SelectItem value="120">{t('settings.calendar.duration2hours')}</SelectItem>
            </SelectContent>
          </Select>
        </LabeledRow>
        <LabeledRow label={t('settings.calendar.snapInterval')}>
          <Select value={String(settings.snapInterval)} onValueChange={handleSnapIntervalChange}>
            <SelectTrigger variant="ghost">
              <SelectValue placeholder={t('settings.calendar.selectInterval')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">{t('settings.calendar.interval5min')}</SelectItem>
              <SelectItem value="10">{t('settings.calendar.interval10min')}</SelectItem>
              <SelectItem value="15">{t('settings.calendar.interval15min')}</SelectItem>
              <SelectItem value="30">{t('settings.calendar.interval30min')}</SelectItem>
            </SelectContent>
          </Select>
        </LabeledRow>
      </SectionCard>
    </div>
  );
}
