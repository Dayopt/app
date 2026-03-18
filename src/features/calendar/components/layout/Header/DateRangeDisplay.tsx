'use client';

import { format, getWeek } from 'date-fns';
import { enUS, ja } from 'date-fns/locale';
import { ChevronDown } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { MiniCalendar } from '@/components/ui/mini-calendar';
import { cn } from '@/lib/utils';

import type { Locale } from 'date-fns';

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
 * 日付範囲のテキストを生成
 */
const generateRangeText = (
  date: Date,
  endDate: Date,
  dateFnsLocale: Locale,
  localeCode: string,
): string => {
  const sameMonth = date.getMonth() === endDate.getMonth();
  const sameYear = date.getFullYear() === endDate.getFullYear();
  const isJa = localeCode === 'ja';

  if (sameYear && sameMonth) {
    // 同月の場合: "2025年1月 1-7日" / "1-7 January 2025"
    if (isJa) {
      return `${format(date, 'yyyy年M月', { locale: dateFnsLocale })} ${format(date, 'd')}-${format(endDate, 'd')}日`;
    }
    return `${format(date, 'd')}-${format(endDate, 'd')} ${format(date, 'MMMM yyyy', { locale: dateFnsLocale })}`;
  } else if (sameYear) {
    // 同年異月の場合: "2025年 12月30日 - 1月5日" / "30 Dec - 5 Jan 2025"
    if (isJa) {
      return `${format(date, 'yyyy年 M月d日', { locale: dateFnsLocale })} - ${format(endDate, 'M月d日', { locale: dateFnsLocale })}`;
    }
    return `${format(date, 'd MMM', { locale: dateFnsLocale })} - ${format(endDate, 'd MMM yyyy', { locale: dateFnsLocale })}`;
  } else {
    // 異年の場合: "2024年12月30日 - 2025年1月5日" / "30 Dec 2024 - 5 Jan 2025"
    if (isJa) {
      return `${format(date, 'yyyy年M月d日', { locale: dateFnsLocale })} - ${format(endDate, 'yyyy年M月d日', { locale: dateFnsLocale })}`;
    }
    return `${format(date, 'd MMM yyyy', { locale: dateFnsLocale })} - ${format(endDate, 'd MMM yyyy', { locale: dateFnsLocale })}`;
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

  // ロケールに応じたフォーマットパターン（翻訳ファイルから取得）
  const localizedFormatPattern =
    formatPattern === 'MMMM yyyy' ? tCommon('dates.formats.monthYear') : formatPattern;

  // 表示テキストを決定
  const displayText =
    endDate && date.getTime() !== endDate.getTime()
      ? generateRangeText(date, endDate, dateFnsLocale, locale)
      : format(date, localizedFormatPattern, { locale: dateFnsLocale });

  // 日付コンテンツ
  const dateContent = <h2 className="text-2xl font-normal">{displayText}</h2>;

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
          {t('weekLabel', { weekNumber: getWeek(date, { weekStartsOn: 1 }) })}
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

  // ロケールに応じたフォーマット（翻訳ファイルから取得）
  const dateFormat = tCommon('dates.formats.monthDay');

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <span className="text-base font-normal">
        {format(date, dateFormat, { locale: dateFnsLocale })}
      </span>
      {showWeekNumber ? (
        <span className="text-muted-foreground text-xs">
          {t('weekLabel', { weekNumber: getWeek(date, { weekStartsOn: 1 }) })}
        </span>
      ) : null}
    </div>
  );
};
