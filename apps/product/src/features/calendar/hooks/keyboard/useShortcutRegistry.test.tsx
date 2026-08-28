import { fireEvent, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useShellStore } from '@/lib/stores/useShellStore';

import { useShortcutRegistry } from './useShortcutRegistry';

vi.mock('@/lib/hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}));

beforeEach(() => {
  useShellStore.getState().closeSheet();
});

describe('useShortcutRegistry', () => {
  it('疑問符キーでショートカット一覧を開く', () => {
    renderHook(() => useShortcutRegistry());

    fireEvent.keyDown(window, { key: '?', shiftKey: true });

    expect(useShellStore.getState().activeSheet).toEqual({ type: 'shortcutCheatSheet' });
  });

  it('入力中の疑問符キーでは開かない', () => {
    renderHook(() => useShortcutRegistry());
    const input = document.createElement('input');
    document.body.append(input);

    fireEvent.keyDown(input, { key: '?', shiftKey: true });

    expect(useShellStore.getState().activeSheet).toBeNull();
  });
});
