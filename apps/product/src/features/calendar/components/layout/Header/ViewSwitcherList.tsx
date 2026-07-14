'use client';

import { CalendarDays, CalendarRange, Check, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useShellStore } from '@/lib/stores/useShellStore';
import { cn } from '@dayopt/components';
import { useCalendarNavigation } from '../../../hooks/navigation/CalendarNavigationContext';
import type { CalendarViewType } from '../../../types/calendar.types';

/** ビュー選択オプションの定義 */
interface MainViewOption {
  value: CalendarViewType;
  count: number;
  shortcut: string;
  icon: LucideIcon;
}

const MAIN_VIEW_OPTIONS: MainViewOption[] = [
  { value: 'day', count: 1, shortcut: '1', icon: CalendarDays },
  { value: '2day', count: 2, shortcut: '2', icon: CalendarRange },
  { value: '3day', count: 3, shortcut: '3', icon: CalendarRange },
  { value: '4day', count: 4, shortcut: '4', icon: CalendarRange },
  { value: '5day', count: 5, shortcut: '5', icon: CalendarRange },
  { value: '6day', count: 6, shortcut: '6', icon: CalendarRange },
  { value: 'week', count: 7, shortcut: '7', icon: CalendarRange },
];

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

  const getMainViewLabel = (option: MainViewOption): string =>
    option.count === 1
      ? t('calendar.views.day')
      : t('calendar.views.multiday', { count: option.count });

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
              <span>{getMainViewLabel(option)}</span>
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
    </div>
  );
}
