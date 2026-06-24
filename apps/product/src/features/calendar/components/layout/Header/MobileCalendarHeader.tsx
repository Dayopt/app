'use client';

import { format, getWeek, isSameMonth } from 'date-fns';
import { enUS, ja } from 'date-fns/locale';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { memo, useCallback, useState, type ReactNode } from 'react';

import { AppHeader } from '@/components/shell/AppHeader';
import { isTodayInTimezone } from '@/lib/date/timezone';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import { Button, cn } from '@dayopt/components';

import type { NavigationDirection } from '@/components/ui/navigation/DateNavigator';

import { MobileMonthGrid } from './MobileMonthGrid';
import { MobileYearStrip } from './MobileYearStrip';

interface MobileCalendarHeaderProps {
  currentDate: Date;
  onNavigate: (direction: NavigationDirection) => void;
  /** ホバー/タッチ時にナビゲーション先のデータを事前取得する */
  onPrefetch?: ((direction: NavigationDirection) => void) | undefined;
  onDateSelect?: ((date: Date) => void) | undefined;
  displayRange?: { start: Date; end: Date } | undefined;
  rightSlot?: ReactNode | undefined;
  className?: string | undefined;
  defaultExpanded?: boolean | undefined;
}

/**
 * モバイル専用カレンダーヘッダー
 *
 * AppHeader + インライン展開月グリッド。
 * ヘッダータップで月グリッドをインライン展開し、タイムラインを押し下げる。
 * Google Calendar のモバイルUIを参考にした設計。
 */
export const MobileCalendarHeader = memo<MobileCalendarHeaderProps>(
  ({
    currentDate,
    onNavigate,
    onPrefetch,
    onDateSelect,
    displayRange,
    rightSlot,
    className,
    defaultExpanded,
  }) => {
    const t = useTranslations('calendar');
    const locale = useLocale();
    const dateFnsLocale = locale === 'ja' ? ja : enUS;
    const [isExpanded, setIsExpanded] = useState(defaultExpanded ?? false);

    // viewMonth: グリッドスワイプで独立して変化する表示月
    const [viewMonth, setViewMonth] = useState(() => currentDate);

    // render-time sync: currentDateの月が変わったらviewMonthも追従
    const [prevCurrentDate, setPrevCurrentDate] = useState(currentDate);
    if (!isSameMonth(currentDate, prevCurrentDate)) {
      setPrevCurrentDate(currentDate);
      setViewMonth(currentDate);
    } else if (currentDate !== prevCurrentDate) {
      setPrevCurrentDate(currentDate);
    }

    // ヘッダー: 月部分・日番号・接尾辞を分離して今日バッジ + 週数を1行に統合
    const weekStartsOn = useUserPreferences((s) => s.weekStartsOn);
    const showWeekNumbers = useUserPreferences((s) => s.showWeekNumbers);
    const timezone = useUserPreferences((s) => s.timezone);
    const monthPart = format(currentDate, locale === 'ja' ? 'M月' : 'MMM ', {
      locale: dateFnsLocale,
    });
    const dayNumber = format(currentDate, 'd');
    const daySuffix = locale === 'ja' ? '日' : '';
    const weekdayShort = format(currentDate, 'EEE', { locale: enUS });
    const today = isTodayInTimezone(currentDate, timezone);
    const weekNumber = getWeek(currentDate, { weekStartsOn });

    const handleToggle = useCallback(() => {
      setIsExpanded((prev) => !prev);
    }, []);

    // Google Calendar準拠: 日付選択してもパネルは閉じない（Chevronタップでのみ閉じる）
    const handleDateSelect = useCallback(
      (date: Date) => {
        onDateSelect?.(date);
      },
      [onDateSelect],
    );

    // 月変更時: ローカルviewMonth更新 + メインカレンダーも連動
    const handleViewMonthChange = useCallback(
      (newMonth: Date) => {
        setViewMonth(newMonth);
        onDateSelect?.(newMonth);
      },
      [onDateSelect],
    );

    const handleTodayClick = useCallback(() => {
      onNavigate('today');
    }, [onNavigate]);

    const ChevronIcon = isExpanded ? ChevronUp : ChevronDown;

    return (
      <div className={cn('bg-background sticky top-0 z-20 md:hidden', className)}>
        <AppHeader
          rightSlot={
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                icon
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={handleTodayClick}
                onMouseEnter={() => onPrefetch?.('today')}
                onTouchStart={() => onPrefetch?.('today')}
                aria-label={t('actions.goToToday')}
              >
                <div className="relative flex size-5 flex-col">
                  <div className="h-1 w-full border-b-2 border-current" />
                  <div className="flex flex-1 items-center justify-center">
                    <span className="text-xs leading-none font-medium">{new Date().getDate()}</span>
                  </div>
                </div>
              </Button>
              {rightSlot}
            </div>
          }
        >
          <button
            type="button"
            onClick={handleToggle}
            className="flex items-center gap-1"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? t('actions.closeMiniCalendar') : t('actions.openCalendar')}
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
              {showWeekNumbers ? (
                <span className="bg-muted text-muted-foreground flex size-6 items-center justify-center rounded-full text-xs font-normal">
                  {weekNumber}
                </span>
              ) : null}
            </h2>
            <ChevronIcon className="text-muted-foreground size-5" />
          </button>
        </AppHeader>

        {/* インライン展開パネル — grid-rows アニメーション */}
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-in-out',
            isExpanded ? 'grid-rows-expanded' : 'grid-rows-collapsed',
          )}
        >
          <div className="overflow-hidden">
            <div>
              {/* 月グリッド */}
              <MobileMonthGrid
                viewMonth={viewMonth}
                selectedDate={currentDate}
                displayRange={displayRange}
                onViewMonthChange={handleViewMonthChange}
                onDateSelect={handleDateSelect}
                className="w-full"
              />

              {/* 年セレクタ — 横スクロール */}
              <MobileYearStrip
                viewMonth={viewMonth}
                onViewMonthChange={handleViewMonthChange}
                className=""
              />
            </div>
          </div>
        </div>
      </div>
    );
  },
);

MobileCalendarHeader.displayName = 'MobileCalendarHeader';
