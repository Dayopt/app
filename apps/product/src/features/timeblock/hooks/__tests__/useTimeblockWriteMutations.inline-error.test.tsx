import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTimeblockWriteMutations } from '../useTimeblockWriteMutations';

interface MutationCallbacks {
  onError?: (
    error: { message: string },
    input: { id: string; data: { start_at: string; end_at: string } } | undefined,
    context: undefined,
  ) => void;
  onSettled?: () => void;
}

const mocks = vi.hoisted(() => ({
  planCreateCallbacks: undefined as MutationCallbacks | undefined,
  recordCreateCallbacks: undefined as MutationCallbacks | undefined,
  planUpdateCallbacks: undefined as MutationCallbacks | undefined,
  recordUpdateCallbacks: undefined as MutationCallbacks | undefined,
  plansInvalidate: vi.fn(),
  recordsInvalidate: vi.fn(),
  statisticsInvalidate: vi.fn(),
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
          invalidate: mocks.plansInvalidate,
          list: { cancel: vi.fn() },
          getById: { setData: vi.fn() },
        },
        records: {
          invalidate: mocks.recordsInvalidate,
          list: { cancel: vi.fn() },
          getById: { setData: vi.fn() },
        },
        statistics: {
          invalidate: mocks.statisticsInvalidate,
        },
      }),
      plans: {
        create: {
          useMutation: (callbacks: MutationCallbacks) => {
            mocks.planCreateCallbacks = callbacks;
            return mutation();
          },
        },
        update: {
          useMutation: (callbacks: MutationCallbacks) => {
            mocks.planUpdateCallbacks = callbacks;
            return mutation();
          },
        },
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
        update: {
          useMutation: (callbacks: MutationCallbacks) => {
            mocks.recordUpdateCallbacks = callbacks;
            return mutation();
          },
        },
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
    mocks.planUpdateCallbacks = undefined;
    mocks.recordUpdateCallbacks = undefined;
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

  it('updateのTIME_OVERLAPを入力付きでinline handlerへ委譲する', () => {
    const onUpdateTimeOverlap = vi.fn();
    renderHook(() => useTimeblockWriteMutations({ onUpdateTimeOverlap }));
    const input = {
      id: 'plan-1',
      data: {
        start_at: '2026-07-17T09:00:00.000Z',
        end_at: '2026-07-17T10:00:00.000Z',
      },
    };

    act(() =>
      mocks.planUpdateCallbacks?.onError?.(
        { message: 'TIME_OVERLAP: overlapping plan' },
        input,
        undefined,
      ),
    );

    expect(onUpdateTimeOverlap).toHaveBeenCalledWith(input);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('updateの通常エラーはinline handlerを使わずトーストへ送る', () => {
    const onUpdateTimeOverlap = vi.fn();
    renderHook(() => useTimeblockWriteMutations({ onUpdateTimeOverlap }));

    act(() =>
      mocks.recordUpdateCallbacks?.onError?.(
        { message: 'UNKNOWN' },
        {
          id: 'record-1',
          data: {
            start_at: '2026-07-17T09:00:00.000Z',
            end_at: '2026-07-17T10:00:00.000Z',
          },
        },
        undefined,
      ),
    );

    expect(onUpdateTimeOverlap).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenLastCalledWith('toast.saveFailed');
  });

  it('mutation完了時にPlan・Record・統計cacheをまとめて再検証する', () => {
    renderHook(() => useTimeblockWriteMutations());

    act(() => mocks.planCreateCallbacks?.onSettled?.());

    expect(mocks.plansInvalidate).toHaveBeenCalledOnce();
    expect(mocks.recordsInvalidate).toHaveBeenCalledOnce();
    expect(mocks.statisticsInvalidate).toHaveBeenCalledOnce();
  });
});
