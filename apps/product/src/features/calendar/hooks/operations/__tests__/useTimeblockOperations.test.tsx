import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CalendarEvent } from '@/features/timeblock';

const createPlanMutate = vi.fn();
const createRecordMutate = vi.fn();
const updatePlanMutate = vi.fn();
const updateRecordMutate = vi.fn();
const deletePlanMutate = vi.fn();
const deleteRecordMutate = vi.fn();
const getQueriesData = vi.fn(
  (_opts: { predicate: (q: { queryKey: unknown }) => boolean }) => [] as Array<[unknown, unknown]>,
);
const toastSuccess = vi.fn();
const toastError = vi.fn();
const loggerError = vi.fn();

vi.mock('@/features/timeblock', async () => {
  const actual =
    await vi.importActual<typeof import('@/features/timeblock')>('@/features/timeblock');
  return {
    ...actual,
    useTimeblockWriteMutations: () => ({
      createPlan: { mutate: createPlanMutate },
      createRecord: { mutate: createRecordMutate },
      updatePlan: { mutate: updatePlanMutate },
      updateRecord: { mutate: updateRecordMutate },
      deletePlan: { mutate: deletePlanMutate },
      deleteRecord: { mutate: deleteRecordMutate },
    }),
  };
});

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueriesData,
  }),
}));

vi.mock('@/lib/toast', () => ({
  toast: {
    success: (msg: string, opts: unknown) => toastSuccess(msg, opts),
    error: (msg: string) => toastError(msg),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: loggerError, info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const { useTimeblockOperations } = await import('../useTimeblockOperations');

function makeEvent(overrides: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  const start = new Date('2026-04-27T01:00:00.000Z');
  const end = new Date('2026-04-27T02:00:00.000Z');
  return {
    title: 'Sample',
    startDate: start,
    endDate: end,
    status: 'open',
    color: '',
    createdAt: start,
    updatedAt: start,
    displayStartDate: start,
    displayEndDate: end,
    duration: 60,
    isMultiDay: false,
    origin: 'planned',
    timeblockState: 'upcoming',
    plannedStartDate: start,
    plannedEndDate: end,
    actualStartDate: null,
    actualEndDate: null,
    kind: 'plan',
    ...overrides,
  };
}

/** plans.list / records.list キャッシュ query を模した getQueriesData の戻り値（tRPC v11 query key 形式） */
function makeCache(
  lane: 'plans' | 'records',
  rows: Array<{ id: string; start_at: string; end_at: string }>,
): Array<[unknown, unknown]> {
  return [[[[lane, 'list'], {}], rows]];
}

/** getQueriesData のモック実装: 実装同様 predicate({queryKey}) でフィルタする */
function mockCaches(...caches: Array<[unknown, unknown]>[]) {
  getQueriesData.mockImplementation((opts: { predicate: (q: { queryKey: unknown }) => boolean }) =>
    caches.flat().filter(([queryKey]) => opts.predicate({ queryKey })),
  );
}

describe('useTimeblockOperations', () => {
  beforeEach(() => {
    createPlanMutate.mockReset();
    createRecordMutate.mockReset();
    updatePlanMutate.mockReset();
    updateRecordMutate.mockReset();
    deletePlanMutate.mockReset();
    deleteRecordMutate.mockReset();
    getQueriesData.mockReset();
    getQueriesData.mockReturnValue([]);
    toastSuccess.mockReset();
    toastError.mockReset();
    loggerError.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-26T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('handleTimeblockDelete', () => {
    it('plans.list キャッシュに id があれば deletePlan.mutate を呼ぶ', async () => {
      mockCaches(
        makeCache('plans', [
          {
            id: 'plan-1',
            start_at: '2026-04-27T00:00:00.000Z',
            end_at: '2026-04-27T01:00:00.000Z',
          },
        ]),
      );

      const { result } = renderHook(() => useTimeblockOperations());
      await result.current.handleTimeblockDelete('plan-1');

      expect(deletePlanMutate).toHaveBeenCalledWith({ id: 'plan-1' });
      expect(deleteRecordMutate).not.toHaveBeenCalled();
    });

    it('records.list キャッシュに id があれば deleteRecord.mutate を呼ぶ', async () => {
      mockCaches(
        makeCache('records', [
          {
            id: 'record-1',
            start_at: '2026-04-26T00:00:00.000Z',
            end_at: '2026-04-26T01:00:00.000Z',
          },
        ]),
      );

      const { result } = renderHook(() => useTimeblockOperations());
      await result.current.handleTimeblockDelete('record-1');

      expect(deleteRecordMutate).toHaveBeenCalledWith({ id: 'record-1' });
      expect(deletePlanMutate).not.toHaveBeenCalled();
    });

    it('キャッシュに id が見つからなければ何も mutate せず logger.error する', async () => {
      const { result } = renderHook(() => useTimeblockOperations());
      await result.current.handleTimeblockDelete('unknown-id');

      expect(deletePlanMutate).not.toHaveBeenCalled();
      expect(deleteRecordMutate).not.toHaveBeenCalled();
      expect(loggerError).toHaveBeenCalled();
    });
  });

  describe('handleUpdateTimeblock: object overload (CalendarEvent)', () => {
    it('kind=plan の未来イベントは updatePlan.mutate を呼ぶ', async () => {
      const event = makeEvent({ id: 'plan-1', kind: 'plan' });

      const { result } = renderHook(() => useTimeblockOperations());
      await result.current.handleUpdateTimeblock(event);

      expect(updatePlanMutate).toHaveBeenCalledWith(
        {
          id: 'plan-1',
          data: {
            start_at: '2026-04-27T01:00:00.000Z',
            end_at: '2026-04-27T02:00:00.000Z',
          },
        },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
      expect(updateRecordMutate).not.toHaveBeenCalled();
    });

    it('kind=record の過去イベントは updateRecord.mutate を呼ぶ', async () => {
      const start = new Date('2026-04-25T01:00:00.000Z');
      const end = new Date('2026-04-25T02:00:00.000Z');
      const event = makeEvent({ id: 'record-1', kind: 'record', startDate: start, endDate: end });

      const { result } = renderHook(() => useTimeblockOperations());
      await result.current.handleUpdateTimeblock(event);

      expect(updateRecordMutate).toHaveBeenCalledWith(
        {
          id: 'record-1',
          data: {
            start_at: '2026-04-25T01:00:00.000Z',
            end_at: '2026-04-25T02:00:00.000Z',
          },
        },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
      expect(updatePlanMutate).not.toHaveBeenCalled();
    });

    it('startDate が null なら logger.error を出して mutate を呼ばない', async () => {
      const event = makeEvent({ id: 'plan-1', startDate: null });

      const { result } = renderHook(() => useTimeblockOperations());
      await result.current.handleUpdateTimeblock(event);

      expect(loggerError).toHaveBeenCalled();
      expect(updatePlanMutate).not.toHaveBeenCalled();
      expect(updateRecordMutate).not.toHaveBeenCalled();
    });

    it('endDate が null なら logger.error を出して mutate を呼ばない', async () => {
      const event = makeEvent({ id: 'plan-1', endDate: null });

      const { result } = renderHook(() => useTimeblockOperations());
      await result.current.handleUpdateTimeblock(event);

      expect(loggerError).toHaveBeenCalled();
      expect(updatePlanMutate).not.toHaveBeenCalled();
      expect(updateRecordMutate).not.toHaveBeenCalled();
    });

    it('キャッシュ上の plan が既に過去（end_at <= now）なら timeLocked トーストを出し mutate を呼ばない', async () => {
      mockCaches(
        makeCache('plans', [
          {
            id: 'plan-1',
            start_at: '2026-04-25T01:00:00.000Z',
            end_at: '2026-04-25T02:00:00.000Z',
          },
        ]),
      );
      const event = makeEvent({ id: 'plan-1', kind: 'plan' });

      const { result } = renderHook(() => useTimeblockOperations());
      await result.current.handleUpdateTimeblock(event);

      expect(updatePlanMutate).not.toHaveBeenCalled();
      expect(toastError).toHaveBeenCalledWith('timeblock.editor.timeLocked');
    });

    it('record を未来へ動かす更新は timeLocked トーストを出し mutate を呼ばない', async () => {
      const start = new Date('2026-04-27T01:00:00.000Z');
      const end = new Date('2026-04-27T02:00:00.000Z');
      const event = makeEvent({ id: 'record-1', kind: 'record', startDate: start, endDate: end });

      const { result } = renderHook(() => useTimeblockOperations());
      await result.current.handleUpdateTimeblock(event);

      expect(updateRecordMutate).not.toHaveBeenCalled();
      expect(toastError).toHaveBeenCalledWith('timeblock.editor.timeLocked');
    });

    it('onSuccess で showTimeChangeUndoToast が呼ばれ、Undo クリックで前の時間へ戻す', async () => {
      mockCaches(
        makeCache('plans', [
          {
            id: 'plan-1',
            start_at: '2026-04-27T00:00:00.000Z',
            end_at: '2026-04-27T00:30:00.000Z',
          },
        ]),
      );
      const event = makeEvent({ id: 'plan-1', kind: 'plan' });

      const { result } = renderHook(() => useTimeblockOperations());
      await result.current.handleUpdateTimeblock(event);

      const onSuccess = updatePlanMutate.mock.calls[0]?.[1].onSuccess as () => void;
      onSuccess();

      expect(toastSuccess).toHaveBeenCalledTimes(1);
      const [, opts] = toastSuccess.mock.calls[0] as [string, { action: { onClick: () => void } }];
      opts.action.onClick();

      expect(updatePlanMutate).toHaveBeenLastCalledWith({
        id: 'plan-1',
        data: {
          start_at: '2026-04-27T00:00:00.000Z',
          end_at: '2026-04-27T00:30:00.000Z',
        },
      });
    });
  });

  describe('handleUpdateTimeblock: string overload', () => {
    it('id だけの呼び出しで updates が無ければ何もしない', async () => {
      const { result } = renderHook(() => useTimeblockOperations());
      await result.current.handleUpdateTimeblock('plan-1');

      expect(loggerError).toHaveBeenCalled();
      expect(updatePlanMutate).not.toHaveBeenCalled();
      expect(updateRecordMutate).not.toHaveBeenCalled();
    });

    it('id + updates + キャッシュ一致で kind を逆引きして updatePlan.mutate を呼ぶ', async () => {
      mockCaches(
        makeCache('plans', [
          {
            id: 'plan-1',
            start_at: '2026-04-27T00:00:00.000Z',
            end_at: '2026-04-27T00:30:00.000Z',
          },
        ]),
      );

      const { result } = renderHook(() => useTimeblockOperations());
      await result.current.handleUpdateTimeblock('plan-1', {
        startTime: new Date('2026-04-27T01:00:00.000Z'),
        endTime: new Date('2026-04-27T02:00:00.000Z'),
      });

      expect(updatePlanMutate).toHaveBeenCalledWith(
        {
          id: 'plan-1',
          data: {
            start_at: '2026-04-27T01:00:00.000Z',
            end_at: '2026-04-27T02:00:00.000Z',
          },
        },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });
  });
});
