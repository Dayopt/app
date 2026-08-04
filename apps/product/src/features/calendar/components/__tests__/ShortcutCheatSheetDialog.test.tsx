import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ShortcutCatalog } from '@/lib/keyboard/shortcut-catalog';
import { ShortcutCheatSheetDialog } from '../ShortcutCheatSheetDialog';

const CATALOG: ShortcutCatalog = {
  groups: [
    { id: 'blocks', labelKey: 'calendar.shortcuts.groups.blocks', scope: 'calendar', order: 0 },
  ],
  entries: [
    {
      groupId: 'blocks',
      labelKey: 'calendar.shortcuts.actions.copyBlock',
      order: 10,
      keys: ['Cmd+C'],
    },
    {
      groupId: 'blocks',
      labelKey: 'calendar.shortcuts.actions.deleteBlock',
      order: 20,
      keys: ['Delete', 'Backspace'],
    },
  ],
};

describe('ShortcutCheatSheetDialog', () => {
  it('登録済み操作をplatformに合うキー表記で表示する', () => {
    render(
      <ShortcutCheatSheetDialog open onOpenChange={vi.fn()} catalog={CATALOG} platform="mac" />,
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
        catalog={CATALOG}
        platform="other"
      />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
