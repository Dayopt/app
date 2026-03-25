'use client';

import { useCallback } from 'react';

import { useLocale, useTranslations } from 'next-intl';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useTheme } from '@/hooks/useTheme';
import { usePathname, useRouter } from '@/platform/i18n/navigation';
import { routing, type Locale } from '@/platform/i18n/routing';

import { getTimeZones } from '@/lib/timezone-utils';
import type { DateFormatType } from '@/stores/useCalendarSettingsStore';
import { useUserSettings } from '../hooks/useUserSettings';

import { LabeledRow } from '@/components/common/LabeledRow';
import { SectionCard } from '@/components/common/SectionCard';

/**
 * 一般設定コンポーネント
 *
 * 言語、テーマ、タイムゾーン、日付/時間形式、週の開始日を統合管理
 */
export function GeneralSettings() {
  const t = useTranslations();
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { settings, saveSettings, isPending } = useUserSettings();

  const handleLanguageChange = useCallback(
    (value: string) => {
      const newLocale = value as Locale;
      if (newLocale !== locale) {
        router.replace(pathname, { locale: newLocale });
        router.refresh();
      }
    },
    [locale, pathname, router],
  );

  const handleThemeChange = useCallback(
    (value: string) => {
      setTheme(value as 'system' | 'light' | 'dark');
    },
    [setTheme],
  );

  const handleTimezoneChange = useCallback(
    (value: string) => {
      saveSettings({ timezone: value });
    },
    [saveSettings],
  );

  const handleTimeFormatChange = useCallback(
    (value: string) => {
      saveSettings({ timeFormat: value as '12h' | '24h' });
    },
    [saveSettings],
  );

  const handleDateFormatChange = useCallback(
    (value: string) => {
      saveSettings({ dateFormat: value as DateFormatType });
    },
    [saveSettings],
  );

  const handleWeekStartsOnChange = useCallback(
    (value: string) => {
      saveSettings({ weekStartsOn: Number(value) as 0 | 1 | 6 });
    },
    [saveSettings],
  );

  if (isPending) {
    return (
      <div className="space-y-8">
        {Array.from({ length: 3 }, (_, i) => (
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
      {/* Language & Theme */}
      <SectionCard title={t('settings.preferences.languageAndTheme')}>
        <LabeledRow label={t('settings.preferences.language')}>
          <Select value={locale} onValueChange={handleLanguageChange}>
            <SelectTrigger variant="ghost">
              <SelectValue placeholder={t('settings.preferences.selectLanguage')} />
            </SelectTrigger>
            <SelectContent>
              {routing.locales.map((loc) => (
                <SelectItem key={loc} value={loc}>
                  {loc === 'ja' ? '日本語' : 'English'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabeledRow>
        <LabeledRow label={t('settings.preferences.themeLabel')}>
          <Select value={theme} onValueChange={handleThemeChange}>
            <SelectTrigger variant="ghost">
              <SelectValue placeholder={t('settings.preferences.selectTheme')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">{t('settings.preferences.themeSystem')}</SelectItem>
              <SelectItem value="light">{t('settings.preferences.themeLight')}</SelectItem>
              <SelectItem value="dark">{t('settings.preferences.themeDark')}</SelectItem>
            </SelectContent>
          </Select>
        </LabeledRow>
      </SectionCard>

      {/* Region & Format */}
      <SectionCard title={t('settings.calendar.timeAndTimezone')}>
        <LabeledRow label={t('settings.calendar.timezone')}>
          <Select value={settings.timezone} onValueChange={handleTimezoneChange}>
            <SelectTrigger variant="ghost">
              <SelectValue placeholder={t('settings.calendar.selectTimezone')} />
            </SelectTrigger>
            <SelectContent>
              {getTimeZones().map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>
                  {tz.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LabeledRow>
        <LabeledRow label={t('settings.calendar.timeFormat')}>
          <Select value={settings.timeFormat} onValueChange={handleTimeFormatChange}>
            <SelectTrigger variant="ghost">
              <SelectValue placeholder={t('settings.calendar.selectTimeFormat')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">{t('settings.calendar.timeFormat24h')}</SelectItem>
              <SelectItem value="12h">{t('settings.calendar.timeFormat12h')}</SelectItem>
            </SelectContent>
          </Select>
        </LabeledRow>
        <LabeledRow label={t('settings.calendar.dateFormat')}>
          <Select value={settings.dateFormat} onValueChange={handleDateFormatChange}>
            <SelectTrigger variant="ghost">
              <SelectValue placeholder={t('settings.calendar.selectDateFormat')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yyyy/MM/dd">{t('settings.calendar.dateFormatJapan')}</SelectItem>
              <SelectItem value="MM/dd/yyyy">{t('settings.calendar.dateFormatUS')}</SelectItem>
              <SelectItem value="dd/MM/yyyy">{t('settings.calendar.dateFormatEU')}</SelectItem>
              <SelectItem value="yyyy-MM-dd">{t('settings.calendar.dateFormatISO')}</SelectItem>
            </SelectContent>
          </Select>
        </LabeledRow>
        <LabeledRow label={t('settings.calendar.weekStartsOn')}>
          <Select value={String(settings.weekStartsOn)} onValueChange={handleWeekStartsOnChange}>
            <SelectTrigger variant="ghost">
              <SelectValue placeholder={t('settings.calendar.selectStartDay')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">{t('settings.calendar.sunday')}</SelectItem>
              <SelectItem value="1">{t('settings.calendar.monday')}</SelectItem>
              <SelectItem value="6">{t('settings.calendar.saturday')}</SelectItem>
            </SelectContent>
          </Select>
        </LabeledRow>
      </SectionCard>
    </div>
  );
}
