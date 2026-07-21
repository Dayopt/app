import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PublicRecordRow } from '@/lib/database';

import { useTimeblockRecordMutations } from '../useTimeblockRecordMutations';

type RecordRow = PublicRecordRow;

interface MutationCallbacks<TData> {
  onSuccess?: (data: TData) => void;
}

const mocks = vi.hoisted(() => ({
  recordCallbacks: undefined as MutationCallbacks<RecordRow> | undefined,
  confirmDayCallbacks: undefined as MutationCallbacks<RecordRow[]> | undefined,
  listSetData: vi.fn(),
  getByIdSetData: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueriesData: vi.fn(() => []),
    setQueryData: vi.fn(),
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/lib/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/trpc', () => ({
  api: {
    useUtils: () => ({
      plans: {
        list: { cancel: vi.fn(), invalidate: vi.fn() },
      },
      records: {
        getById: { setData: mocks.getByIdSetData },
        list: {
          cancel: vi.fn(),
          invalidate: vi.fn(),
          setData: mocks.listSetData,
        },
      },
    }),
    plans: {
      record: {
        useMutation: (callbacks: MutationCallbacks<RecordRow>) => {
          mocks.recordCallbacks = callbacks;
          return { isPending: false, mutate: vi.fn() };
        },
      },
      confirmDay: {
        useMutation: (callbacks: MutationCallbacks<RecordRow[]>) => {
          mocks.confirmDayCallbacks = callbacks;
          return { isPending: false, mutate: vi.fn() };
        },
      },
    },
  },
}));

const record = {
  id: 'record-1',
  user_id: 'user-1',
  tag_id: 'tag-1',
  plan_id: 'plan-1',
  external_calendar_event_id: null,
  title: 'API development',
  note: 'Done',
  start_at: '2026-07-14T09:00:00.000Z',
  end_at: '2026-07-14T10:00:00.000Z',
  source: 'from_plan',
  deleted_at: null,
  created_at: '2026-07-14T10:00:00.000Z',
  updated_at: '2026-07-14T10:00:00.000Z',
} satisfies RecordRow;

describe('useTimeblockRecordMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordCallbacks = undefined;
    mocks.confirmDayCallbacks = undefined;
  });

  it('ワンタップ記録の返却行を一覧と詳細cacheへ同時に反映する', () => {
    renderHook(() => useTimeblockRecordMutations());

    act(() => mocks.recordCallbacks?.onSuccess?.(record));

    expect(mocks.getByIdSetData).toHaveBeenCalledWith({ id: record.id }, record);
    const listUpdater = mocks.listSetData.mock.calls[0]?.[1] as
      ((old: RecordRow[] | undefined) => RecordRow[]) | undefined;
    expect(listUpdater?.(undefined)).toEqual([record]);
  });

  it('日次確定の返却行も詳細cacheへ反映する', () => {
    const secondRecord = { ...record, id: 'record-2' };
    renderHook(() => useTimeblockRecordMutations());

    act(() => mocks.confirmDayCallbacks?.onSuccess?.([record, secondRecord]));

    expect(mocks.getByIdSetData).toHaveBeenNthCalledWith(1, { id: record.id }, record);
    expect(mocks.getByIdSetData).toHaveBeenNthCalledWith(2, { id: secondRecord.id }, secondRecord);
  });
});
