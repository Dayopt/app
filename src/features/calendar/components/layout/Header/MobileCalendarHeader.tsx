'use client';

import { format, isSameMonth } from 'date-fns';
import { enUS, ja } from 'date-fns/locale';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { memo, useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useGlobalSearch } from '@/hooks/use-global-search';
import { cn } from '@/lib/utils';
import { AppHeader } from '@/shell/components/AppHeader';
import { MobileCreateButton } from '@/shell/components/MobileCreateButton';

import type { NavigationDirection } from '@/components/common/DateNavigator';

import { MobileMonthGrid } from './MobileMonthGrid';
import { MobileYearStrip } from './MobileYearStrip';

interface MobileCalendarHeaderProps {
  currentDate: Date;
  onNavigate: (direction: NavigationDirection) => void;
  onDateSelect?: ((date: Date) => void) | undefined;
  displayRange?: { start: Date; end: Date } | undefined;
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
  ({ currentDate, onNavigate, onDateSelect, displayRange, className, defaultExpanded }) => {
    const t = useTranslations('calendar');
    const tCommon = useTranslations('common');
    const locale = useLocale();
    const dateFnsLocale = locale === 'ja' ? ja : enUS;
    const { open: openSearch } = useGlobalSearch();
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

    // ヘッダーテキスト: currentDateの月日を表示（Dayビューのみ）
    const monthDayFormat = tCommon('dates.formats.monthDay');
    const headerText = format(currentDate, monthDayFormat, { locale: dateFnsLocale });

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

    const handleTodayClick = useCallback(() => {
      onNavigate('today');
    }, [onNavigate]);

    const ChevronIcon = isExpanded ? ChevronUp : ChevronDown;

    return (
      <div className={cn('bg-background sticky top-0 z-20 md:hidden', className)}>
        <AppHeader
          rightSlot={
            <>
              <Button
                variant="ghost"
                icon
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={handleTodayClick}
                aria-label={t('actions.goToToday')}
              >
                <div className="relative flex size-5 flex-col">
                  <div className="h-1 w-full border-b-2 border-current" />
                  <div className="flex flex-1 items-center justify-center">
                    <span className="text-xs leading-none font-bold">{new Date().getDate()}</span>
                  </div>
                </div>
              </Button>
              <MobileCreateButton />
            </>
          }
        >
          <button
            type="button"
            onClick={handleToggle}
            className="flex items-center gap-1"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? t('actions.closeMiniCalendar') : t('actions.openCalendar')}
          >
            <h2 className="text-xl">{headerText}</h2>
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
              {/* 検索バー */}
              <button
                type="button"
                onClick={openSearch}
                className="bg-muted text-muted-foreground mx-3 mt-1 mb-2 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg px-3 py-2 text-sm"
              >
                <Search className="size-4 shrink-0" />
                <span>{tCommon('search.placeholder')}</span>
              </button>

              {/* 月グリッド */}
              <MobileMonthGrid
                viewMonth={viewMonth}
                selectedDate={currentDate}
                displayRange={displayRange}
                onViewMonthChange={setViewMonth}
                onDateSelect={handleDateSelect}
                className="w-full"
              />

              {/* 年セレクタ — 横スクロール */}
              <MobileYearStrip
                viewMonth={viewMonth}
                onViewMonthChange={setViewMonth}
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
