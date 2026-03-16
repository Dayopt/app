import { useEffect } from 'react';

import type { CalendarViewType } from '../types/calendar.types';

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
 * - Cmd/Ctrl + 2: Split-Day View
 * - Cmd/Ctrl + 3: 3-Day View
 * - Cmd/Ctrl + 5: Week View (週末なし)
 * - Cmd/Ctrl + 7: Week View
 * - Cmd/Ctrl + W: 週末表示切り替え
 */
export const useCalendarKeyboard = ({
  viewType,
  onNavigate,
  onViewChange,
  onToggleWeekends,
}: UseCalendarKeyboardProps) => {
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        // input/textarea 内ではショートカットを無効化
        // (Cmd+A = 全選択, Cmd+←/→ = 行頭/行末 などブラウザ標準操作を妨げない)
        const { activeElement } = document;
        if (
          activeElement &&
          (activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.getAttribute('contenteditable') === 'true')
        ) {
          return;
        }

        switch (e.key) {
          case 'ArrowLeft':
            e.preventDefault();
            onNavigate('prev');
            break;
          case 'ArrowRight':
            e.preventDefault();
            onNavigate('next');
            break;
          case 't':
            e.preventDefault();
            onNavigate('today');
            break;
          case '1':
            e.preventDefault();
            onViewChange('day');
            break;
          case '3':
            e.preventDefault();
            onViewChange('3day');
            break;
          case '5':
            e.preventDefault();
            onViewChange('5day');
            break;
          case '7':
            e.preventDefault();
            onViewChange('week');
            break;
          case 'w':
            e.preventDefault();
            onToggleWeekends();
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [viewType, onNavigate, onViewChange, onToggleWeekends]);
};
