'use client';

import { format, getWeek } from 'date-fns';
import { enUS, ja } from 'date-fns/locale';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { CompactDateNavigator } from '@/lib/components/common/DateNavigator';
import type { DateRangeDisplayProps } from '@/lib/components/common/DateRangeDisplay';
import { AppHeader } from '@/lib/components/shell/AppHeader';
import { MiniCalendar } from '@/lib/components/ui/mini-calendar';
import { isTodayInTimezone } from '@/lib/date/timezone';
import { useCalendarSettingsStore } from '@/lib/stores/useCalendarSettingsStore';
import { cn } from '@/lib/utils';

import type { NavigationDirection } from '@/lib/components/common/DateNavigator';

import type { ReviewGranularity } from '../../stores/useReviewFilterStore';
import { ReviewGranularitySelector } from './ReviewGranularitySelector';

interface MobileReviewHeaderProps {
  dateDisplayProps: DateRangeDisplayProps;
  granularity: ReviewGranularity;
  showGranularity: boolean;
  onNavigate: (direction: NavigationDirection) => void;
  onDateSelect: (date: Date) => void;
  onGranularityChange: (granularity: ReviewGranularity) => void;
}

/**
 * モバイル専用 Stats ヘッダー
 *
 * MobileCalendarHeader と同じパターンで md:hidden。
 * コンパクト日付表示 + prev/next + 粒度セレクタ。
 */
export function MobileReviewHeader({
  dateDisplayProps,
  granularity,
  showGranularity,
  onNavigate,
  onDateSelect,
  onGranularityChange,
}: MobileReviewHeaderProps) {
  const t = useTranslations('calendar.actions');
  const locale = useLocale();
  const dateFnsLocale = locale === 'ja' ? ja : enUS;
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const [isExpanded, setIsExpanded] = useState(false);
  const ChevronIcon = isExpanded ? ChevronUp : ChevronDown;
  const currentDate = dateDisplayProps.date;
  const weekStartsOn = dateDisplayProps.weekStartsOn ?? 1;
  const monthPart = format(currentDate, locale === 'ja' ? 'M月' : 'MMM ', {
    locale: dateFnsLocale,
  });
  const dayNumber = format(currentDate, 'd');
  const daySuffix = locale === 'ja' ? '日' : '';
  const weekdayShort = format(currentDate, 'EEE', { locale: enUS });
  const today = isTodayInTimezone(currentDate, timezone);
  const weekNumber = getWeek(currentDate, { weekStartsOn });

  return (
    <div className="bg-background sticky top-0 z-20 md:hidden">
      <AppHeader
        rightSlot={
          showGranularity ? (
            <ReviewGranularitySelector
              granularity={granularity}
              onGranularityChange={onGranularityChange}
            />
          ) : undefined
        }
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="flex items-center gap-1"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? t('closeMiniCalendar') : t('openCalendar')}
          >
            <h2 className="flex items-center gap-2 text-xl">
              <span className="flex items-center">
                <span>{monthPart}</span>
                <span
                  className={cn(
                    'flex items-center justify-center',
                    today &&
                      'bg-primary text-primary-foreground size-7 rounded-full text-base font-medium',
                  )}
                >
                  {dayNumber}
                </span>
                {daySuffix ? <span>{daySuffix}</span> : null}
              </span>
              <span className="text-sm font-normal">{weekdayShort}</span>
              {dateDisplayProps.showWeekNumber ? (
                <span className="bg-muted text-muted-foreground flex size-6 items-center justify-center rounded-full text-xs font-normal">
                  {weekNumber}
                </span>
              ) : null}
            </h2>
            <ChevronIcon className="text-muted-foreground size-5" />
          </button>
          <CompactDateNavigator onNavigate={onNavigate} />
        </div>
      </AppHeader>

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-in-out',
          isExpanded ? 'grid-rows-expanded' : 'grid-rows-collapsed',
        )}
      >
        <div className="overflow-hidden">
          <MiniCalendar
            selectedDate={dateDisplayProps.date}
            onDateSelect={(date) => {
              if (date) onDateSelect(date);
            }}
            className="w-full px-2 pb-2"
          />
        </div>
      </div>
    </div>
  );
}
