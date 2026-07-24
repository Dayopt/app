import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTimeblockWriteMutations } from '../useTimeblockWriteMutations';

interface PlanUpdateInput {
  id: string;
  data: {
    title?: string;
  };
}

interface PlanUpdateCallbacks {
  onError?: (error: { message: string }, input: PlanUpdateInput, context: unknown) => void;
  onMutate?: (input: PlanUpdateInput) => Promise<unknown>;
}

const mocks = vi.hoisted(() => ({
  planUpdateCallbacks: undefined as PlanUpdateCallbacks | undefined,
  queryClient: null as QueryClient | null,
}));

function planDetailKey(id: string): QueryKey {
  return [['plans', 'getById'], { input: { id }, type: 'query' }];
}

function planListKey(): QueryKey {
  return [['plans', 'list'], { input: {}, type: 'query' }];
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/lib/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/trpc', () => {
  const mutation = () => ({ isPending: false, mutate: vi.fn(), mutateAsync: vi.fn() });
  const useMutation = () => mutation();
  const setPlanDetailData = (
    input: { id: string },
    updater: unknown | ((old: unknown) => unknown),
  ) => {
    const queryClient = mocks.queryClient;
    if (!queryClient) return;
    const key = planDetailKey(input.id);
    const next =
      typeof updater === 'function'
        ? (updater as (old: unknown) => unknown)(queryClient.getQueryData(key))
        : updater;
    if (next !== undefined) queryClient.setQueryData(key, next);
  };

  return {
    api: {
      useUtils: () => ({
        plans: {
          getById: { setData: setPlanDetailData },
          invalidate: vi.fn(),
          list: { cancel: vi.fn(async () => undefined) },
        },
        records: {
          getById: { setData: vi.fn() },
          invalidate: vi.fn(),
          list: { cancel: vi.fn(async () => undefined) },
        },
        statistics: { invalidate: vi.fn() },
      }),
      plans: {
        create: { useMutation },
        delete: { useMutation },
        restore: { useMutation },
        skip: { useMutation },
        unskip: { useMutation },
        update: {
          useMutation: (callbacks: PlanUpdateCallbacks) => {
            mocks.planUpdateCallbacks = callbacks;
            return mutation();
          },
        },
      },
      records: {
        create: { useMutation },
        delete: { useMutation },
        restore: { useMutation },
        update: { useMutation },
      },
    },
  };
});

const originalPlan = {
  id: 'plan-1',
  user_id: 'user-1',
  tag_id: null,
  external_calendar_event_id: null,
  title: 'Original',
  note: null,
  start_at: '2026-07-24T00:00:00.000Z',
  end_at: '2026-07-24T01:00:00.000Z',
  skipped_at: null,
  source: 'manual',
  deleted_at: null,
  created_at: '2026-07-23T00:00:00.000Z',
  updated_at: '2026-07-23T00:00:00.000Z',
};

const updateInput: PlanUpdateInput = {
  id: originalPlan.id,
  data: { title: 'Local draft' },
};

describe('useTimeblockWriteMutations rollback boundary', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    mocks.queryClient = queryClient;
    mocks.planUpdateCallbacks = undefined;
    queryClient.setQueryData(planDetailKey(originalPlan.id), originalPlan);
    queryClient.setQueryData(planListKey(), [originalPlan]);
  });

  function wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  async function optimisticallyUpdatePlan(): Promise<unknown> {
    renderHook(() => useTimeblockWriteMutations(), { wrapper });
    let context: unknown;
    await act(async () => {
      context = await mocks.planUpdateCallbacks?.onMutate?.(updateInput);
    });
    expect(
      queryClient.getQueryData<typeof originalPlan>(planDetailKey(originalPlan.id))?.title,
    ).toBe('Local draft');
    return context;
  }

  it('後続query更新がなければmutation失敗時に元のsnapshotへ戻す', async () => {
    const context = await optimisticallyUpdatePlan();

    act(() => {
      mocks.planUpdateCallbacks?.onError?.({ message: 'failed' }, updateInput, context);
    });

    expect(queryClient.getQueryData(planDetailKey(originalPlan.id))).toEqual(originalPlan);
    expect(queryClient.getQueryData(planListKey())).toEqual([originalPlan]);
  });

  it('query cancel中の外部更新をrollbackの基準snapshotとして保持する', async () => {
    renderHook(() => useTimeblockWriteMutations(), { wrapper });
    const externalPlan = {
      ...originalPlan,
      title: 'External before optimistic write',
      updated_at: '2026-07-24T01:30:00.000Z',
    };
    let contextPromise!: Promise<unknown>;
    act(() => {
      contextPromise = mocks.planUpdateCallbacks?.onMutate?.(updateInput) ?? Promise.resolve();
      queryClient.setQueryData(planDetailKey(originalPlan.id), externalPlan);
    });

    let context: unknown;
    await act(async () => {
      context = await contextPromise;
    });
    expect(
      queryClient.getQueryData<typeof originalPlan>(planDetailKey(originalPlan.id))?.title,
    ).toBe('Local draft');

    act(() => {
      mocks.planUpdateCallbacks?.onError?.({ message: 'failed' }, updateInput, context);
    });

    expect(queryClient.getQueryData(planDetailKey(originalPlan.id))).toEqual(externalPlan);
  });

  it('optimistic write後の外部更新を古いsnapshotで上書きしない', async () => {
    const context = await optimisticallyUpdatePlan();
    const externalPlan = {
      ...originalPlan,
      title: 'External update',
      updated_at: '2026-07-24T02:00:00.000Z',
    };
    queryClient.setQueryData(planDetailKey(originalPlan.id), externalPlan);

    act(() => {
      mocks.planUpdateCallbacks?.onError?.({ message: 'failed' }, updateInput, context);
    });

    expect(queryClient.getQueryData(planDetailKey(originalPlan.id))).toEqual(externalPlan);
  });

  it('optimistic write後のNOT_FOUNDをsuccess cacheへ戻さない', async () => {
    const context = await optimisticallyUpdatePlan();
    const notFound = Object.assign(new Error('not found'), {
      data: { code: 'NOT_FOUND', serviceCode: 'NOT_FOUND' },
    });

    await expect(
      queryClient.fetchQuery({
        queryFn: async () => {
          throw notFound;
        },
        queryKey: planDetailKey(originalPlan.id),
      }),
    ).rejects.toBe(notFound);
    expect(queryClient.getQueryState(planDetailKey(originalPlan.id))?.status).toBe('error');

    act(() => {
      mocks.planUpdateCallbacks?.onError?.({ message: 'failed' }, updateInput, context);
    });

    const detailState = queryClient.getQueryState(planDetailKey(originalPlan.id));
    expect(detailState?.status).toBe('error');
    expect(detailState?.error).toBe(notFound);
  });

  it('mutationが最初にNOT_FOUNDを知った時は再open用success cacheを除去する', async () => {
    const context = await optimisticallyUpdatePlan();
    const notFound = Object.assign(new Error('not found'), {
      data: { code: 'NOT_FOUND', serviceCode: 'NOT_FOUND' },
    });

    act(() => {
      mocks.planUpdateCallbacks?.onError?.(notFound, updateInput, context);
    });

    expect(queryClient.getQueryData(planDetailKey(originalPlan.id))).toBeUndefined();
    expect(queryClient.getQueryData(planListKey())).toEqual([]);
  });
});
