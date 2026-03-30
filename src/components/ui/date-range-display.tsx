'use client';

import { format, getWeek } from 'date-fns';
import { enUS, ja } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import type { Locale } from 'date-fns';

/** DateRangeDisplay コンポーネントのプロパティ */
export interface DateRangeDisplayProps {
  date: Date;
  endDate?: Date | undefined;
  showWeekNumber?: boolean | undefined;
  formatPattern?: string | undefined;
  className?: string | undefined;
}

/**
 * 日付範囲のテキストを生成（翻訳テンプレート使用）
 */
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
 * 日付範囲表示（共通UIコンポーネント）
 *
 * 単一日付または期間をテキストで表示。
 * 週番号の表示にも対応。Calendar / Stats 等で共通利用。
 */
export function DateRangeDisplay({
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

  // ロケールに応じたフォーマットパターン（翻訳ファイルから取得）
  const localizedFormatPattern =
    formatPattern === 'MMMM yyyy' ? tCommon('dates.formats.monthYear') : formatPattern;

  // 表示テキストを決定
  const displayText =
    endDate && date.getTime() !== endDate.getTime()
      ? generateRangeText(date, endDate, dateFnsLocale, tCommon)
      : format(date, localizedFormatPattern, { locale: dateFnsLocale });

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <h2 className="text-2xl font-normal text-pretty">{displayText}</h2>
      {showWeekNumber ? (
        <span className="text-muted-foreground text-lg">
          {t('weekLabel', { weekNumber: getWeek(date, { weekStartsOn }) })}
        </span>
      ) : null}
    </div>
  );
}

/**
 * コンパクトな日付表示（モバイル用）
 */
export function CompactDateDisplay({
  date,
  showWeekNumber = false,
  className,
}: Pick<DateRangeDisplayProps, 'date' | 'showWeekNumber' | 'className'>) {
  const t = useTranslations('calendar.dateRange');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const dateFnsLocale = locale === 'ja' ? ja : enUS;
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  // ロケールに応じたフォーマット（翻訳ファイルから取得）
  const dateFormat = tCommon('dates.formats.monthDay');

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <span className="text-base font-normal">
        {format(date, dateFormat, { locale: dateFnsLocale })}
      </span>
      {showWeekNumber ? (
        <span className="text-muted-foreground text-xs">
          {t('weekLabel', { weekNumber: getWeek(date, { weekStartsOn }) })}
        </span>
      ) : null}
    </div>
  );
}
