'use client';

import { format, getWeek } from 'date-fns';
import { enUS, ja } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import type { StatsGranularity } from '../../stores/useStatsFilterStore';

interface StatsDateDisplayProps {
  currentDate: Date;
  granularity: StatsGranularity;
  className?: string;
}

/**
 * Stats 用の日付コンテキスト表示
 *
 * Google Calendar の DateRangeDisplay と同じフォーマット:
 * - day:   「2026年3月10日」 + 「第11週」
 * - week:  「2026年3月」    + 「第11週」
 * - month: 「2026年3月」
 * - year:  「2026年」
 */
export function StatsDateDisplay({ currentDate, granularity, className }: StatsDateDisplayProps) {
  const t = useTranslations('calendar.dateRange');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const dateFnsLocale = locale === 'ja' ? ja : enUS;
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  // メインテキスト（h2）
  const mainText = (() => {
    switch (granularity) {
      case 'day': {
        const pattern = tCommon('dates.formats.monthDayYear');
        return format(currentDate, pattern, { locale: dateFnsLocale });
      }
      case 'week':
      case 'month': {
        const pattern = tCommon('dates.formats.monthYear');
        return format(currentDate, pattern, { locale: dateFnsLocale });
      }
      case 'year': {
        return tCommon('dates.formats.year', { year: currentDate.getFullYear() });
      }
    }
  })();

  // 週番号（day/week 粒度のみ表示）
  const showWeekNumber = granularity === 'day' || granularity === 'week';
  const weekNumber = showWeekNumber ? getWeek(currentDate, { weekStartsOn }) : null;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <h2 className="text-2xl">{mainText}</h2>
      {weekNumber !== null && (
        <span className="text-muted-foreground text-lg">{t('weekLabel', { weekNumber })}</span>
      )}
    </div>
  );
}
