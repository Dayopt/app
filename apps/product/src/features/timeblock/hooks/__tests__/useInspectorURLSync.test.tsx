import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTimeblockInspectorStore } from '../../stores/useTimeblockInspectorStore';

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
    useTimeblockInspectorStore.getState().closeInspector();
  });

  it('同じUUIDでplanからrecordへ切り替えた時もURLを更新する', () => {
    renderHook(() => useInspectorURLSync());

    act(() => useTimeblockInspectorStore.getState().openInspector('same-id', 'plan'));
    expect(push).toHaveBeenLastCalledWith('/ja/day?timeblock=plan%3Asame-id', { scroll: false });

    act(() => useTimeblockInspectorStore.getState().openInspector('same-id', 'record'));
    expect(push).toHaveBeenLastCalledWith('/ja/day?timeblock=record%3Asame-id', { scroll: false });
  });

  it('popstateで同じUUIDのkindだけが変わった場合もstoreを更新する', () => {
    useTimeblockInspectorStore.getState().openInspector('same-id', 'plan');
    renderHook(() => useInspectorURLSync());

    window.history.replaceState({}, '', '/ja/day?timeblock=record%3Asame-id');
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));

    expect(useTimeblockInspectorStore.getState()).toMatchObject({
      timeblockId: 'same-id',
      timeblockKind: 'record',
      isOpen: true,
    });
  });

  it('初期URLのrecordを正しいUUIDで開く', () => {
    window.history.replaceState({}, '', '/ja/day?timeblock=record%3Arecord-id');
    renderHook(() => useInspectorURLSync());
    expect(useTimeblockInspectorStore.getState()).toMatchObject({
      timeblockId: 'record-id',
      timeblockKind: 'record',
      isOpen: true,
    });
  });

  it('旧log URLは受理しない', () => {
    window.history.replaceState({}, '', '/ja/day?timeblock=log%3Alegacy-id');
    renderHook(() => useInspectorURLSync());
    expect(useTimeblockInspectorStore.getState()).toMatchObject({
      timeblockId: null,
      isOpen: false,
    });
  });
});
