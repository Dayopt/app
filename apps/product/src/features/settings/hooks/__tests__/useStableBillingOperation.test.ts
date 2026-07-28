import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useStableBillingOperation } from '../useStableBillingOperation';

const FIRST_OPERATION_ID = '00000000-0000-4000-8000-000000000001';
const SECOND_OPERATION_ID = '00000000-0000-4000-8000-000000000002';

describe('useStableBillingOperation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('blocks a synchronous double-click and reuses the ID after a retryable error', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(FIRST_OPERATION_ID);
    const { result } = renderHook(() => useStableBillingOperation());

    let first: string | null = null;
    let second: string | null = null;
    act(() => {
      first = result.current.begin();
      second = result.current.begin();
    });

    expect(first).toBe(FIRST_OPERATION_ID);
    expect(second).toBeNull();
    expect(result.current.isLocked).toBe(true);

    act(() => {
      expect(result.current.settle(FIRST_OPERATION_ID, 'retryable')).toBe(true);
    });
    expect(result.current.isLocked).toBe(false);

    let retry: string | null = null;
    act(() => {
      retry = result.current.begin();
    });
    expect(retry).toBe(FIRST_OPERATION_ID);
    expect(crypto.randomUUID).toHaveBeenCalledOnce();
  });

  it('allocates a new ID after a terminal outcome', () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce(FIRST_OPERATION_ID)
      .mockReturnValueOnce(SECOND_OPERATION_ID);
    const { result } = renderHook(() => useStableBillingOperation());

    act(() => {
      expect(result.current.begin()).toBe(FIRST_OPERATION_ID);
      expect(result.current.settle(FIRST_OPERATION_ID, 'terminal')).toBe(true);
    });

    act(() => {
      expect(result.current.begin()).toBe(SECOND_OPERATION_ID);
    });
  });

  it('ignores a stale settlement after reset or unmount', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(FIRST_OPERATION_ID);
    const { result, unmount } = renderHook(() => useStableBillingOperation());

    act(() => {
      expect(result.current.begin()).toBe(FIRST_OPERATION_ID);
      result.current.reset();
    });
    expect(result.current.settle(FIRST_OPERATION_ID, 'terminal')).toBe(false);

    act(() => {
      expect(result.current.begin()).toBe(FIRST_OPERATION_ID);
    });
    const settle = result.current.settle;
    unmount();

    expect(settle(FIRST_OPERATION_ID, 'terminal')).toBe(false);
  });
});
