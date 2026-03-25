import { useCallback, useEffect } from 'react';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { CalendarSettings } from '@/stores/useCalendarSettingsStore';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

/**
 * 週末表示切り替えのキーボードショートカット（Cmd/Ctrl + W）を管理するフック
 */
export function useWeekendToggleShortcut(
  onSettingsChange?: ((settings: Partial<CalendarSettings>) => void) | undefined,
) {
  const showWeekends = useCalendarSettingsStore((s) => s.showWeekends);
  const updateSettings = useCalendarSettingsStore((s) => s.updateSettings);
  const t = useTranslations('calendar.toast');

  const persistSettings = useCallback(
    (settings: Partial<CalendarSettings>) => {
      updateSettings(settings);
      onSettingsChange?.(settings);
    },
    [updateSettings, onSettingsChange],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd (Mac) または Ctrl (Windows/Linux) + W
      const isToggleShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'w';

      if (!isToggleShortcut) return;

      // デフォルトのブラウザ動作（ウィンドウを閉じる）を防ぐ
      event.preventDefault();
      event.stopPropagation();

      // 入力フィールドにフォーカスがある場合は無視
      const { activeElement } = document;
      const isInputField =
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.getAttribute('contenteditable') === 'true' ||
          activeElement.getAttribute('role') === 'textbox');

      if (isInputField) return;

      // モーダルやダイアログが開いている場合は無視
      const hasOpenModal = document.querySelector('[role="dialog"]') !== null;
      if (hasOpenModal) return;

      // 週末表示を切り替え
      const newState = !showWeekends;
      persistSettings({ showWeekends: newState });

      // 成功フィードバック
      toast(newState ? t('weekendsShown') : t('weekendsHidden'));
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showWeekends, persistSettings, t]);

  return {
    showWeekends,
    toggleWeekends: () => persistSettings({ showWeekends: !showWeekends }),
  };
}

/** 週末表示切り替えショートカットのヘルプ情報 */
export const WEEKEND_TOGGLE_SHORTCUT_HELP = {
  key: 'Cmd/Ctrl + W',
  description: 'Toggle Weekend Display',
  mac: '⌘W',
  windows: 'Ctrl+W',
} as const;
