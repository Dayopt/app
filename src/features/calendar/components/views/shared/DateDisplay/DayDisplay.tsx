/**
 * 日付ヘッダーコンポーネント
 */

'use client';

import { useLocale, useTranslations } from 'next-intl';
import { memo } from 'react';

import { cn } from '@/lib/utils';

import type { DayDisplayProps } from '../types/view.types';
import { formatDate } from '../utils/dateHelpers';

// ヘルパー関数: ヘッダークラスを生成
const generateHeaderClasses = (
  isToday: boolean,
  isSelected: boolean,
  isWeekend: boolean,
  onClick?: (date: Date) => void,
  className?: string,
): string => {
  const baseClasses =
    'flex items-center justify-center py-2 px-1 text-center transition-colors rounded-2xl';

  const hoverClasses =
    onClick && !isToday
      ? 'cursor-pointer hover:bg-state-hover'
      : onClick && isToday
        ? 'cursor-pointer'
        : '';

  const statusClasses = isToday
    ? 'bg-primary text-primary-foreground font-bold'
    : isSelected
      ? 'bg-primary-state-selected text-primary'
      : isWeekend
        ? 'text-muted-foreground'
        : 'text-foreground';

  return [baseClasses, hoverClasses, statusClasses, className].filter(Boolean).join(' ');
};

// ヘルパー関数: テキストクラスを生成
const getTextClasses = (isToday: boolean, isBase: boolean = false): string => {
  if (isToday) {
    return isBase ? 'text-primary-foreground' : 'text-primary-foreground/75';
  }
  return 'text-muted-foreground';
};

/** 曜日・日付・今日マーカーを含む日付ヘッダーコンポーネント */
export const DayDisplay = memo<DayDisplayProps>(function DayDisplay({
  date,
  isToday = false,
  isWeekend = false,
  isSelected = false,
  format = 'short',
  onClick,
  className = '',
}) {
  const locale = useLocale();
  const t = useTranslations('common');
  const dateLocale = locale === 'ja' ? 'ja-JP' : 'en-US';

  const handleClick = () => {
    onClick?.(date);
  };

  // ヘッダーのスタイルクラス
  const headerClasses = generateHeaderClasses(isToday, isSelected, isWeekend, onClick, className);

  // 日付の表示形式
  const dateDisplay = formatDate(date, format, locale);

  return onClick ? (
    <button
      className={headerClasses}
      onClick={handleClick}
      aria-label={t('aria.selectDate', { date: dateDisplay })}
      type="button"
    >
      <div className="flex min-w-0 flex-col items-center">
        {/* 曜日 */}
        <div className={cn('text-xs', getTextClasses(isToday))}>
          {date.toLocaleDateString(dateLocale, { weekday: 'short' })}
        </div>

        {/* 日付 */}
        <div className={cn('text-lg font-bold', getTextClasses(isToday, true))}>
          {date.getDate()}
        </div>

        {/* 月（異なる月の場合のみ表示） */}
        {format === 'long' && (
          <div className={cn('text-xs', getTextClasses(isToday))}>
            {date.toLocaleDateString(dateLocale, { month: 'short' })}
          </div>
        )}
      </div>
    </button>
  ) : (
    <div className={headerClasses}>
      <div className="flex min-w-0 flex-col items-center">
        {/* 曜日 */}
        <div className={`text-xs ${getTextClasses(isToday)}`}>
          {date.toLocaleDateString(dateLocale, { weekday: 'short' })}
        </div>

        {/* 日付 */}
        <div className={`text-lg font-bold ${getTextClasses(isToday, true)}`}>{date.getDate()}</div>

        {/* 月（異なる月の場合のみ表示） */}
        {format === 'long' && (
          <div className={`text-xs ${getTextClasses(isToday)}`}>
            {date.toLocaleDateString(dateLocale, { month: 'short' })}
          </div>
        )}
      </div>
    </div>
  );
});
