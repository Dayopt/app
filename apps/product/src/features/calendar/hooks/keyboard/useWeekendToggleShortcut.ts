import { useCallback, useEffect, useRef } from 'react';

import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';

import { useCalendarSettingsStore } from '@/lib/stores/useCalendarSettingsStore';
import type { UserSettings } from '@/lib/stores/userSettings';
import type { ShortcutDef } from './shortcut-registry';
import { registerShortcut } from './shortcut-registry';

/**
 * 週末表示切り替えのキーボードショートカット（Cmd/Ctrl + W）を管理するフック
 */
export function useWeekendToggleShortcut(
  onSettingsChange?: ((settings: Partial<UserSettings>) => void) | undefined,
) {
  const showWeekends = useCalendarSettingsStore((s) => s.showWeekends);
  const updateSettings = useCalendarSettingsStore((s) => s.updateSettings);
  const t = useTranslations('calendar.toast');

  const persistSettings = useCallback(
    (settings: Partial<UserSettings>) => {
      updateSettings(settings);
      onSettingsChange?.(settings);
    },
    [updateSettings, onSettingsChange],
  );

  // Ref for latest values in shortcut handler
  const showWeekendsRef = useRef(showWeekends);
  const persistSettingsRef = useRef(persistSettings);
  const tRef = useRef(t);

  useEffect(() => {
    showWeekendsRef.current = showWeekends;
    persistSettingsRef.current = persistSettings;
    tRef.current = t;
  }, [showWeekends, persistSettings, t]);

  useEffect(() => {
    const def: ShortcutDef = {
      key: 'Cmd+W',
      description: '週末表示切り替え',
      priority: 10, // useCalendarKeyboardのCmd+Wより高い優先度
      handler: (event) => {
        event.preventDefault();
        event.stopPropagation();

        // モーダルやダイアログが開いている場合は無視
        const hasOpenModal = document.querySelector('[role="dialog"]') !== null;
        if (hasOpenModal) return;

        const newState = !showWeekendsRef.current;
        persistSettingsRef.current({ showWeekends: newState });
        toast(newState ? tRef.current('weekendsShown') : tRef.current('weekendsHidden'));
      },
    };

    return registerShortcut(def);
  }, []);

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
