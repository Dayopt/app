import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ShortcutHelpItem } from '@/lib/keyboard/shortcut-registry';
import { ShortcutCheatSheetDialog } from '../ShortcutCheatSheetDialog';

const SHORTCUTS: ShortcutHelpItem[] = [
  {
    group: 'blocks',
    labelKey: 'calendar.shortcuts.actions.copyBlock',
    order: 10,
    keys: ['Cmd+C'],
  },
  {
    group: 'blocks',
    labelKey: 'calendar.shortcuts.actions.deleteBlock',
    order: 20,
    keys: ['Delete', 'Backspace'],
  },
];

describe('ShortcutCheatSheetDialog', () => {
  it('登録済み操作をplatformに合うキー表記で表示する', () => {
    render(
      <ShortcutCheatSheetDialog open onOpenChange={vi.fn()} shortcuts={SHORTCUTS} platform="mac" />,
    );

    expect(screen.getByText('calendar.shortcuts.actions.copyBlock')).toBeInTheDocument();
    expect(screen.getByText('⌘C')).toBeInTheDocument();
    expect(screen.getAllByText('⌫')).toHaveLength(1);
  });

  it('Escapeで閉じる', () => {
    const onOpenChange = vi.fn();
    render(
      <ShortcutCheatSheetDialog
        open
        onOpenChange={onOpenChange}
        shortcuts={SHORTCUTS}
        platform="other"
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
