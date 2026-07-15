import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTimeblockWriteMutations } from './useTimeblockWriteMutations';

interface MutationCallbacks {
  onError?: (error: { message: string }, input: unknown, context: undefined) => void;
}

const mocks = vi.hoisted(() => ({
  planCreateCallbacks: undefined as MutationCallbacks | undefined,
  recordCreateCallbacks: undefined as MutationCallbacks | undefined,
  toastError: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueriesData: vi.fn(() => []),
    setQueriesData: vi.fn(),
    setQueryData: vi.fn(),
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/lib/toast', () => ({
  toast: { error: mocks.toastError, success: vi.fn() },
}));

vi.mock('@/lib/trpc', () => {
  const mutation = () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() });
  const useMutation = () => mutation();

  return {
    api: {
      useUtils: () => ({
        plans: {
          invalidate: vi.fn(),
          list: { cancel: vi.fn() },
          getById: { setData: vi.fn() },
        },
        records: {
          invalidate: vi.fn(),
          list: { cancel: vi.fn() },
          getById: { setData: vi.fn() },
        },
      }),
      plans: {
        create: {
          useMutation: (callbacks: MutationCallbacks) => {
            mocks.planCreateCallbacks = callbacks;
            return mutation();
          },
        },
        update: { useMutation },
        delete: { useMutation },
        restore: { useMutation },
        skip: { useMutation },
        unskip: { useMutation },
      },
      records: {
        create: {
          useMutation: (callbacks: MutationCallbacks) => {
            mocks.recordCreateCallbacks = callbacks;
            return mutation();
          },
        },
        update: { useMutation },
        delete: { useMutation },
        restore: { useMutation },
      },
    },
  };
});

describe('useTimeblockWriteMutations create overlap presentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.planCreateCallbacks = undefined;
    mocks.recordCreateCallbacks = undefined;
  });

  it('inline handler指定時はPlanのTIME_OVERLAPをトーストにせず委譲する', () => {
    const onCreateTimeOverlap = vi.fn();
    renderHook(() => useTimeblockWriteMutations({ onCreateTimeOverlap }));

    act(() =>
      mocks.planCreateCallbacks?.onError?.(
        { message: 'TIME_OVERLAP: overlapping plan' },
        undefined,
        undefined,
      ),
    );

    expect(onCreateTimeOverlap).toHaveBeenCalledOnce();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('inline handler指定時はRecordのTIME_OVERLAPも同じ経路へ委譲する', () => {
    const onCreateTimeOverlap = vi.fn();
    renderHook(() => useTimeblockWriteMutations({ onCreateTimeOverlap }));

    act(() =>
      mocks.recordCreateCallbacks?.onError?.(
        { message: 'TIME_OVERLAP: overlapping record' },
        undefined,
        undefined,
      ),
    );

    expect(onCreateTimeOverlap).toHaveBeenCalledOnce();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('inline handler未指定時とその他のcreate失敗は従来どおりトーストへ送る', () => {
    renderHook(() => useTimeblockWriteMutations());

    act(() =>
      mocks.planCreateCallbacks?.onError?.(
        { message: 'TIME_OVERLAP: overlapping plan' },
        undefined,
        undefined,
      ),
    );
    expect(mocks.toastError).toHaveBeenLastCalledWith('toast.overlap');

    act(() => mocks.recordCreateCallbacks?.onError?.({ message: 'UNKNOWN' }, undefined, undefined));
    expect(mocks.toastError).toHaveBeenLastCalledWith('toast.saveFailed');
  });
});
