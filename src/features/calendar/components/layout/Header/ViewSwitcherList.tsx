'use client';

import { useState } from 'react';

import {
  CalendarDays,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { useShellStore } from '@/shell/stores/useShellStore';
import { useCalendarNavigation } from '../../../hooks/navigation/CalendarNavigationContext';
import type { CalendarViewType } from '../../../types/calendar.types';
import { isMultiDayView } from '../../../types/calendar.types';

/** ビュー選択オプションの定義 */
interface MainViewOption {
  value: CalendarViewType;
  labelKey: string;
  shortcut: string;
  icon: LucideIcon;
}

const MAIN_VIEW_OPTIONS: MainViewOption[] = [
  { value: 'day', labelKey: 'calendar.views.day', shortcut: 'D', icon: CalendarDays },
  { value: 'week', labelKey: 'calendar.views.week', shortcut: 'W', icon: CalendarRange },
];

const DAY_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9] as const;

/**
 * サイドバー用ビュー切り替えリスト（モバイル専用）
 *
 * PCではヘッダーにViewSwitcherがあるため非表示
 */
export function ViewSwitcherList() {
  const navigation = useCalendarNavigation();
  const t = useTranslations();
  const closeSidebar = useShellStore((state) => state.closeSidebar);
  const currentView = navigation?.viewType ?? 'week';
  const [daysExpanded, setDaysExpanded] = useState(false);

  const handleSelect = (view: CalendarViewType) => {
    if (navigation) {
      navigation.changeView(view);
      closeSidebar();
    }
  };

  return (
    <div className="flex flex-col gap-1 px-2 py-2 md:hidden">
      {/* メインビュー */}
      {MAIN_VIEW_OPTIONS.map((option) => {
        const isActive = currentView === option.value;
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => handleSelect(option.value)}
            className={cn(
              'flex w-full items-center justify-between rounded-lg px-4 py-2 text-left text-sm transition-colors',
              'text-muted-foreground hover:bg-state-hover hover:text-foreground',
              isActive && 'text-foreground font-normal',
            )}
          >
            <div className="flex items-center gap-2">
              <Icon className="size-4" />
              <span>{t(option.labelKey)}</span>
            </div>
            <div className="flex items-center gap-2">
              {isActive && <Check className="text-primary size-4" />}
              <span className="bg-surface-container text-muted-foreground rounded-lg px-2 py-1 font-mono text-xs">
                {option.shortcut}
              </span>
            </div>
          </button>
        );
      })}

      {/* 日数サブメニュー（展開式） */}
      <button
        type="button"
        onClick={() => setDaysExpanded(!daysExpanded)}
        className={cn(
          'flex w-full items-center justify-between rounded-lg px-4 py-2 text-left text-sm transition-colors',
          'text-muted-foreground hover:bg-state-hover hover:text-foreground',
          isMultiDayView(currentView) && 'text-foreground font-normal',
        )}
      >
        <div className="flex items-center gap-2">
          <CalendarRange className="size-4" />
          <span>{t('calendar.views.daysSubmenu')}</span>
        </div>
        <div className="flex items-center gap-2">
          {isMultiDayView(currentView) && <Check className="text-primary size-4" />}
          {daysExpanded ? (
            <ChevronDown className="text-muted-foreground size-4" />
          ) : (
            <ChevronRight className="text-muted-foreground size-4" />
          )}
        </div>
      </button>

      {daysExpanded && (
        <div className="flex flex-col gap-0.5 pl-4">
          {DAY_COUNTS.map((count) => {
            const view = `${count}day` as CalendarViewType;
            const isActive = currentView === view;

            return (
              <button
                key={count}
                type="button"
                onClick={() => handleSelect(view)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-4 py-1.5 text-left text-sm transition-colors',
                  'text-muted-foreground hover:bg-state-hover hover:text-foreground',
                  isActive && 'text-foreground font-normal',
                )}
              >
                <span>{t('calendar.views.multiday', { count })}</span>
                <div className="flex items-center gap-2">
                  {isActive && <Check className="text-primary size-4" />}
                  <span className="bg-surface-container text-muted-foreground rounded-lg px-2 py-0.5 font-mono text-xs">
                    {count}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
