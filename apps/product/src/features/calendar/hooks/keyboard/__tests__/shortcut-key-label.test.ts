import { describe, expect, it } from 'vitest';

import { formatShortcutKey } from '../shortcut-key-label';

describe('formatShortcutKey', () => {
  it('Macではmodifierと矢印を記号で表示する', () => {
    expect(formatShortcutKey('Cmd+ArrowLeft', 'mac')).toBe('⌘←');
    expect(formatShortcutKey('Shift+C', 'mac')).toBe('⇧C');
  });

  it('Windows / LinuxではCtrl表記を使う', () => {
    expect(formatShortcutKey('Cmd+C', 'other')).toBe('Ctrl+C');
    expect(formatShortcutKey('Shift+C', 'other')).toBe('Shift+C');
  });

  it('疑問符は入力に必要なShiftを省略する', () => {
    expect(formatShortcutKey('Shift+?', 'mac')).toBe('?');
    expect(formatShortcutKey('Shift+?', 'other')).toBe('?');
  });
});
