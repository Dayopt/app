'use client';

import { format, getWeek } from 'date-fns';
import { enUS, ja } from 'date-fns/locale';
import { ChevronDown } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { MiniCalendar } from '@/components/ui/mini-calendar';
import { cn } from '@/lib/utils';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import type { Locale } from 'date-fns';

/** DateRangeDisplay コンポーネントのプロパティ */
interface DateRangeDisplayProps {
  date: Date;
  endDate?: Date | undefined;
  viewType?: string | undefined;
  showWeekNumber?: boolean | undefined;
  formatPattern?: string | undefined;
  className?: string | undefined;
  onDateSelect?: ((date: Date | undefined) => void) | undefined;
  clickable?: boolean | undefined;
  // 現在表示している期間（MiniCalendarでのハイライト用）
  displayRange?:
    | {
        start: Date;
        end: Date;
      }
    | undefined;
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
 * 日付範囲表示
 * 単一日付または期間を表示
 *
 * **モバイル対応**:
 * - モバイル（md未満）: クリックでMiniCalendarポップアップを表示
 * - PC（md以上）: 静的表示（サイドバーにMiniCalendarあり）
 */
export const DateRangeDisplay = ({
  date,
  endDate,
  showWeekNumber = false,
  formatPattern = 'MMMM yyyy',
  className,
  onDateSelect,
  clickable = false,
  displayRange,
}: DateRangeDisplayProps) => {
  const t = useTranslations('calendar.dateRange');
  const tActions = useTranslations('calendar.actions');
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

  // 日付コンテンツ
  const dateContent = <h2 className="text-2xl font-normal text-pretty">{displayText}</h2>;

  // モバイル用: MiniCalendarポップアップ付き（週番号はカレンダーグリッドに表示するため非表示）
  const mobileContent = clickable && onDateSelect && (
    <MiniCalendar
      asPopover
      popoverTrigger={
        <button
          type="button"
          className={cn('flex items-center gap-1 md:hidden', className)}
          aria-label={tActions('openCalendar')}
        >
          {dateContent}
          <ChevronDown className="text-muted-foreground size-4" />
        </button>
      }
      selectedDate={date}
      displayRange={displayRange}
      onDateSelect={(selectedDate) => {
        if (selectedDate) {
          onDateSelect(selectedDate);
        }
      }}
      popoverAlign="start"
      popoverSide="bottom"
    />
  );

  // PC用: 静的表示（週番号付き）
  const desktopContent = (
    <div className={cn('hidden items-center gap-2 md:flex', className)}>
      {dateContent}
      {showWeekNumber ? (
        <span className="text-muted-foreground text-lg">
          {t('weekLabel', { weekNumber: getWeek(date, { weekStartsOn }) })}
        </span>
      ) : null}
    </div>
  );

  // クリック可能な場合: モバイル（ポップアップ）+ PC（静的）
  if (clickable && onDateSelect) {
    return (
      <>
        {mobileContent}
        {desktopContent}
      </>
    );
  }

  // クリック不可の場合: 静的表示のみ（PC用、週番号なし）
  return <div className={cn('flex items-center gap-2', className)}>{dateContent}</div>;
};

/**
 * コンパクトな日付表示（モバイル用）
 */
export const CompactDateDisplay = ({
  date,
  showWeekNumber = false,
  className,
}: Pick<DateRangeDisplayProps, 'date' | 'showWeekNumber' | 'className'>) => {
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
};
