'use client';

import { format, getWeek } from 'date-fns';
import { enUS, ja } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';

import type { DateRangeDisplayProps } from '@/components/common/DateRangeDisplay';
import { useCalendarSettingsStore } from '@/features/calendar';
import { cn } from '@/lib/utils';

import type { Locale } from 'date-fns';

const generateRangeText = (
  date: Date,
  endDate: Date,
  dateFnsLocale: Locale,
  tCommon: (key: string, params?: Record<string, string | number>) => string,
): string => {
  const sameMonth = date.getMonth() === endDate.getMonth();
  const sameYear = date.getFullYear() === endDate.getFullYear();

  if (sameYear && sameMonth) {
    const monthYearPattern = tCommon('dates.formats.monthYear');
    return tCommon('dates.formats.dayRangeSameMonth', {
      start: format(date, 'd'),
      end: format(endDate, 'd'),
      monthYear: format(date, monthYearPattern, { locale: dateFnsLocale }),
    });
  } else if (sameYear) {
    return tCommon('dates.formats.dayRangeDiffMonth', {
      startDay: format(date, 'd'),
      startMonth: format(date, 'MMM', { locale: dateFnsLocale }),
      endDay: format(endDate, 'd'),
      endMonth: format(endDate, 'MMM', { locale: dateFnsLocale }),
      year: date.getFullYear(),
    });
  } else {
    return tCommon('dates.formats.dayRangeDiffYear', {
      startDay: format(date, 'd'),
      startMonth: format(date, 'MMM', { locale: dateFnsLocale }),
      startYear: date.getFullYear(),
      endDay: format(endDate, 'd'),
      endMonth: format(endDate, 'MMM', { locale: dateFnsLocale }),
      endYear: endDate.getFullYear(),
    });
  }
};

/**
 * Stats モバイル用コンパクト日付表示
 *
 * DateRangeDisplay と同じ props を受け取るが、text-lg でコンパクトに表示。
 * モバイルヘッダー内で使用するため、text-2xl ではなく text-lg を使用。
 */
export function StatsDateDisplay({
  date,
  endDate,
  showWeekNumber = false,
  formatPattern = 'MMMM yyyy',
  className,
}: DateRangeDisplayProps) {
  const t = useTranslations('calendar.dateRange');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const dateFnsLocale = locale === 'ja' ? ja : enUS;
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  const localizedFormatPattern =
    formatPattern === 'MMMM yyyy' ? tCommon('dates.formats.monthYear') : formatPattern;

  const displayText =
    endDate && date.getTime() !== endDate.getTime()
      ? generateRangeText(date, endDate, dateFnsLocale, tCommon)
      : format(date, localizedFormatPattern, { locale: dateFnsLocale });

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <span className="text-xl font-normal text-pretty">{displayText}</span>
      {showWeekNumber ? (
        <span className="text-muted-foreground text-sm">
          {t('weekLabel', { weekNumber: getWeek(date, { weekStartsOn }) })}
        </span>
      ) : null}
    </div>
  );
}
