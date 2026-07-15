export type ShortcutPlatform = 'mac' | 'other';

const MAC_KEY_LABELS: Record<string, string> = {
  Cmd: '⌘',
  Shift: '⇧',
  Alt: '⌥',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  Delete: '⌫',
  Backspace: '⌫',
};

const OTHER_KEY_LABELS: Record<string, string> = {
  Cmd: 'Ctrl',
  Shift: 'Shift',
  Alt: 'Alt',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
};

/** shortcut registryの正規化キーを、利用中platform向けの表示へ変換する。 */
export function formatShortcutKey(key: string, platform: ShortcutPlatform): string {
  if (key === 'Shift+?') return '?';

  const labels = platform === 'mac' ? MAC_KEY_LABELS : OTHER_KEY_LABELS;
  const separator = platform === 'mac' ? '' : '+';
  return key
    .split('+')
    .map((part) => labels[part] ?? part)
    .join(separator);
}
