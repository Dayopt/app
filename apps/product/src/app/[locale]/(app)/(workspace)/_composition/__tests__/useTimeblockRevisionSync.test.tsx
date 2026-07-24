import { act, renderHook } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTimeblockRevisionSync } from '../useTimeblockRevisionSync';

interface RevisionQueryOptions {
  enabled: boolean;
  refetchInterval: number | false;
  refetchIntervalInBackground: boolean;
  refetchOnWindowFocus: boolean;
}

const mocks = vi.hoisted(() => ({
  plansInvalidate: vi.fn(),
  recordsInvalidate: vi.fn(),
  statisticsInvalidate: vi.fn(),
  refetch: vi.fn(() => Promise.resolve()),
  revisionData: undefined as { revision: string } | undefined,
  queryOptions: undefined as RevisionQueryOptions | undefined,
}));

vi.mock('@/lib/trpc', () => ({
  api: {
    useUtils: () => ({
      plans: { invalidate: mocks.plansInvalidate },
      records: { invalidate: mocks.recordsInvalidate },
      statistics: { invalidate: mocks.statisticsInvalidate },
    }),
    timeblockContext: {
      getRevision: {
        useQuery: (_input: undefined, options: RevisionQueryOptions) => {
          mocks.queryOptions = options;
          return {
            data: mocks.revisionData,
            refetch: mocks.refetch,
          };
        },
      },
    },
  },
}));

const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
let visibilityState: DocumentVisibilityState = 'visible';

function setVisibility(nextVisibilityState: DocumentVisibilityState): void {
  visibilityState = nextVisibilityState;
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useTimeblockRevisionSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    visibilityState = 'visible';
    mocks.revisionData = undefined;
    mocks.queryOptions = undefined;
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilityState,
    });
  });

  afterAll(() => {
    if (originalVisibilityDescriptor) {
      Object.defineProperty(document, 'visibilityState', originalVisibilityDescriptor);
    }
  });

  it('初回revisionと変更後revisionごとに関連cacheを一度だけ無効化する', () => {
    mocks.revisionData = { revision: 'revision-1' };
    const { rerender } = renderHook(() => useTimeblockRevisionSync());

    expect(mocks.plansInvalidate).toHaveBeenCalledOnce();
    expect(mocks.recordsInvalidate).toHaveBeenCalledOnce();
    expect(mocks.statisticsInvalidate).toHaveBeenCalledOnce();

    rerender();
    expect(mocks.plansInvalidate).toHaveBeenCalledOnce();

    mocks.revisionData = { revision: 'revision-2' };
    rerender();

    expect(mocks.plansInvalidate).toHaveBeenCalledTimes(2);
    expect(mocks.recordsInvalidate).toHaveBeenCalledTimes(2);
    expect(mocks.statisticsInvalidate).toHaveBeenCalledTimes(2);
  });

  it('非表示中はpollingを止め、表示復帰時にrevisionを即時再取得する', () => {
    visibilityState = 'hidden';
    mocks.revisionData = { revision: 'revision-1' };
    renderHook(() => useTimeblockRevisionSync());

    expect(mocks.queryOptions).toMatchObject({
      enabled: false,
      refetchInterval: false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: false,
    });
    expect(mocks.plansInvalidate).not.toHaveBeenCalled();

    act(() => setVisibility('visible'));

    expect(mocks.refetch).toHaveBeenCalledOnce();
    expect(mocks.queryOptions).toMatchObject({
      enabled: true,
      refetchInterval: 10_000,
    });
    expect(mocks.plansInvalidate).toHaveBeenCalledOnce();
  });

  it('unmount時にvisibility listenerを解除する', () => {
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useTimeblockRevisionSync());

    unmount();

    expect(removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    removeEventListener.mockRestore();
  });
});
