import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { handleGlobalKeyDown } from '@/lib/keyboard/shortcut-registry';
import { useShellStore } from '@/lib/stores/useShellStore';

import { useTimeblockSearchShortcut } from '../useTimeblockSearchShortcut';

function dispatchSearchShortcut(target: EventTarget, overrides: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key: 'k',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...overrides,
  });
  target.dispatchEvent(event);
  return event;
}

describe('useTimeblockSearchShortcut', () => {
  beforeEach(() => {
    useShellStore.setState({ activeSheet: null });
    document.addEventListener('keydown', handleGlobalKeyDown);
  });

  afterEach(() => {
    document.removeEventListener('keydown', handleGlobalKeyDown);
    document.body.replaceChildren();
  });

  it('Cmd/Ctrl+Kでsearch overlayを開く', () => {
    renderHook(() => useTimeblockSearchShortcut());

    const event = dispatchSearchShortcut(document.body);

    expect(event.defaultPrevented).toBe(true);
    expect(useShellStore.getState().activeSheet).toEqual({ type: 'timeblockSearch' });
  });

  it('input内とIME変換中は開かない', () => {
    renderHook(() => useTimeblockSearchShortcut());
    const input = document.createElement('input');
    document.body.append(input);

    act(() => {
      dispatchSearchShortcut(input);
      dispatchSearchShortcut(document.body, { isComposing: true });
    });

    expect(useShellStore.getState().activeSheet).toBeNull();
  });
});
