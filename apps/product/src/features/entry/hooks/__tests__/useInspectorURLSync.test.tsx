import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useEntryInspectorStore } from '../../stores/useEntryInspectorStore';

const push = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: () => '/ja/day',
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import { useInspectorURLSync } from '../useInspectorURLSync';

describe('useInspectorURLSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/ja/day');
    useEntryInspectorStore.getState().closeInspector();
  });

  it('同じUUIDでplanからlogへ切り替えた時もURLを更新する', () => {
    renderHook(() => useInspectorURLSync());

    act(() => useEntryInspectorStore.getState().openInspector('same-id', 'plan'));
    expect(push).toHaveBeenLastCalledWith('/ja/day?entry=plan%3Asame-id', { scroll: false });

    act(() => useEntryInspectorStore.getState().openInspector('same-id', 'log'));
    expect(push).toHaveBeenLastCalledWith('/ja/day?entry=log%3Asame-id', { scroll: false });
  });

  it('popstateで同じUUIDのkindだけが変わった場合もstoreを更新する', () => {
    useEntryInspectorStore.getState().openInspector('same-id', 'plan');
    renderHook(() => useInspectorURLSync());

    window.history.replaceState({}, '', '/ja/day?entry=log%3Asame-id');
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));

    expect(useEntryInspectorStore.getState()).toMatchObject({
      entryId: 'same-id',
      entryKind: 'log',
      isOpen: true,
    });
  });
});
