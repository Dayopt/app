import { useEffect, useRef } from 'react';

import type { ShortcutDef } from '@/lib/keyboard/shortcut-registry';
import { registerShortcuts } from '@/lib/keyboard/shortcut-registry';
import type { CalendarViewType } from '../../types/calendar.types';

/** useCalendarKeyboard フックのプロパティ */
interface UseCalendarKeyboardProps {
  viewType: CalendarViewType;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onViewChange: (view: CalendarViewType) => void;
  onToggleWeekends: () => void;
}

/**
 * カレンダーのキーボードショートカットを提供するフック
 *
 * ショートカット一覧:
 * - Cmd/Ctrl + ←/→: 前後ナビゲーション
 * - Cmd/Ctrl + T: 今日へ移動
 * - Cmd/Ctrl + 1: Day View
 * - Cmd/Ctrl + 3: 3-Day View
 * - Cmd/Ctrl + 5: 5-Day View
 * - Cmd/Ctrl + 7: 7-Day View
 * - Cmd/Ctrl + W: 週末表示切り替え
 */
export const useCalendarKeyboard = ({
  onNavigate,
  onViewChange,
  onToggleWeekends,
}: UseCalendarKeyboardProps) => {
  const onNavigateRef = useRef(onNavigate);
  const onViewChangeRef = useRef(onViewChange);
  const onToggleWeekendsRef = useRef(onToggleWeekends);

  useEffect(() => {
    onNavigateRef.current = onNavigate;
    onViewChangeRef.current = onViewChange;
    onToggleWeekendsRef.current = onToggleWeekends;
  }, [onNavigate, onViewChange, onToggleWeekends]);

  useEffect(() => {
    const shortcuts: ShortcutDef[] = [
      {
        key: 'Cmd+ArrowLeft',
        description: '前の期間へナビゲーション',
        help: {
          group: 'navigation',
          labelKey: 'calendar.shortcuts.actions.previousPeriod',
          order: 10,
        },
        handler: (e) => {
          e.preventDefault();
          onNavigateRef.current('prev');
        },
      },
      {
        key: 'Cmd+ArrowRight',
        description: '次の期間へナビゲーション',
        help: {
          group: 'navigation',
          labelKey: 'calendar.shortcuts.actions.nextPeriod',
          order: 20,
        },
        handler: (e) => {
          e.preventDefault();
          onNavigateRef.current('next');
        },
      },
      {
        key: 'Cmd+T',
        description: '今日へ移動',
        help: {
          group: 'navigation',
          labelKey: 'calendar.shortcuts.actions.today',
          order: 30,
        },
        handler: (e) => {
          e.preventDefault();
          onNavigateRef.current('today');
        },
      },
      {
        key: 'Cmd+1',
        description: 'Day View に切り替え',
        help: {
          group: 'views',
          labelKey: 'calendar.shortcuts.actions.dayView',
          order: 100,
        },
        handler: (e) => {
          e.preventDefault();
          onViewChangeRef.current('day');
        },
      },
      {
        key: 'Cmd+3',
        description: '3-Day View に切り替え',
        help: {
          group: 'views',
          labelKey: 'calendar.shortcuts.actions.threeDayView',
          order: 120,
        },
        handler: (e) => {
          e.preventDefault();
          onViewChangeRef.current('3day');
        },
      },
      {
        key: 'Cmd+5',
        description: '5-Day View に切り替え',
        help: {
          group: 'views',
          labelKey: 'calendar.shortcuts.actions.fiveDayView',
          order: 140,
        },
        handler: (e) => {
          e.preventDefault();
          onViewChangeRef.current('5day');
        },
      },
      {
        key: 'Cmd+7',
        description: '7-Day View に切り替え',
        help: {
          group: 'views',
          labelKey: 'calendar.shortcuts.actions.sevenDayView',
          order: 160,
        },
        handler: (e) => {
          e.preventDefault();
          onViewChangeRef.current('7day');
        },
      },
      {
        key: 'Cmd+W',
        description: '週末表示切り替え（Cmd）',
        help: {
          group: 'views',
          labelKey: 'calendar.shortcuts.actions.toggleWeekends',
          order: 170,
        },
        handler: (e) => {
          e.preventDefault();
          onToggleWeekendsRef.current();
        },
      },
    ];

    return registerShortcuts(shortcuts);
  }, []);
};
