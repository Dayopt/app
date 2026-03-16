import { useEffect } from 'react';

import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

/**
 * 週末表示切り替えのキーボードショートカット（Cmd/Ctrl + W）を管理するフック
 */
export function useWeekendToggleShortcut() {
  const showWeekends = useCalendarSettingsStore(
    (s) => s.sessionOverrides.showWeekends ?? s.showWeekends,
  );
  const updateSessionOverride = useCalendarSettingsStore((s) => s.updateSessionOverride);

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
      updateSessionOverride({ showWeekends: !showWeekends });

      // 成功フィードバック（短時間のトースト風通知）
      showToggleFeedback(!showWeekends);
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showWeekends, updateSessionOverride]);

  return {
    showWeekends,
    toggleWeekends: () => updateSessionOverride({ showWeekends: !showWeekends }),
  };
}

/**
 * 切り替え時のフィードバック表示
 * XSS対策: innerHTML を使用せず、DOM API で安全に要素を構築
 */
function showToggleFeedback(newState: boolean) {
  // 既存の通知があれば削除
  const existingNotification = document.getElementById('weekend-toggle-feedback');
  if (existingNotification) {
    existingNotification.remove();
  }

  // 通知要素を作成
  const notification = document.createElement('div');
  notification.id = 'weekend-toggle-feedback';
  notification.className = [
    'fixed top-4 right-4 z-[300]',
    'bg-card',
    'border border-border',
    'rounded-2xl shadow-lg',
    'px-4 py-3',
    'flex items-center gap-3',
    'transform transition-all duration-300 ease-out',
    'translate-x-full opacity-0',
  ].join(' ');

  // 内容を安全に構築（DOM API を使用）
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'flex items-center gap-2';

  const indicator = document.createElement('div');
  indicator.className = `w-2 h-2 rounded-full ${newState ? 'bg-primary' : 'bg-muted-foreground'}`;

  const label = document.createElement('span');
  label.className = 'text-sm font-normal text-foreground';
  label.textContent = `週末表示: ${newState ? 'ON' : 'OFF'}`;

  contentWrapper.appendChild(indicator);
  contentWrapper.appendChild(label);

  const shortcutHint = document.createElement('div');
  shortcutHint.className = 'text-xs text-muted-foreground';
  shortcutHint.textContent = 'Cmd/Ctrl + W';

  notification.appendChild(contentWrapper);
  notification.appendChild(shortcutHint);

  document.body.appendChild(notification);

  // アニメーションで表示
  setTimeout(() => {
    notification.classList.remove('translate-x-full', 'opacity-0');
    notification.classList.add('translate-x-0', 'opacity-100');
  }, 10);

  // 2秒後にフェードアウト
  setTimeout(() => {
    notification.classList.add('translate-x-full', 'opacity-0');

    // アニメーション完了後に削除
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 2000);
}

/**
 * ショートカットキーのヘルプ情報
 */
export const WEEKEND_TOGGLE_SHORTCUT_HELP = {
  key: 'Cmd/Ctrl + W',
  description: 'Toggle Weekend Display',
  mac: '⌘W',
  windows: 'Ctrl+W',
} as const;
