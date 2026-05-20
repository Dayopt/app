import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CalendarEvent } from '@/lib/types/calendar-event';

const updateMutate = vi.fn();
const deleteMutate = vi.fn();
const getByIdGetData = vi.fn();
const toastSuccess = vi.fn();
const loggerError = vi.fn();

// domain helper (buildTimeUpdateData 等) は実体を保持し、hook のみ mock する。
// useEntryOperations は entry barrel から buildTimeUpdateData / buildUndoTimeUpdateData を
// import するので、これらが undefined だと time patch の構築が壊れる。
vi.mock('@/features/entry', async () => {
  const actual = await vi.importActual<typeof import('@/features/entry')>('@/features/entry');
  return {
    ...actual,
    useEntryMutations: () => ({
      updateEntry: { mutate: updateMutate },
      deleteEntry: { mutate: deleteMutate },
    }),
  };
});

vi.mock('@/lib/trpc', () => ({
  api: {
    useUtils: () => ({
      entries: {
        getById: { getData: getByIdGetData },
      },
    }),
  },
}));

vi.mock('@/lib/toast', () => ({
  toast: {
    success: (msg: string, opts: unknown) => toastSuccess(msg, opts),
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: loggerError, info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const { useEntryOperations } = await import('../useEntryOperations');

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
    entryState: 'upcoming',
    plannedStartDate: start,
    plannedEndDate: end,
    actualStartDate: start,
    actualEndDate: end,
    ...overrides,
  };
}

describe('useEntryOperations', () => {
  beforeEach(() => {
    updateMutate.mockReset();
    deleteMutate.mockReset();
    getByIdGetData.mockReset();
    toastSuccess.mockReset();
    loggerError.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-26T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('handleEntryDelete', () => {
    it('deleteEntry.mutate を {id} で呼ぶ', async () => {
      const { result } = renderHook(() => useEntryOperations());
      await result.current.handleEntryDelete('entry-1');

      expect(deleteMutate).toHaveBeenCalledWith({ id: 'entry-1' });
    });
  });

  describe('handleUpdateEntry: string overload', () => {
    it('id + updates から start_time / end_time を ISO で渡す', async () => {
      getByIdGetData.mockReturnValue({
        id: 'entry-1',
        origin: 'planned',
        start_time: '2026-04-27T00:00:00.000Z',
        end_time: '2026-04-27T01:00:00.000Z',
        actual_start_time: '2026-04-27T00:00:00.000Z',
        actual_end_time: '2026-04-27T01:00:00.000Z',
      });

      const { result } = renderHook(() => useEntryOperations());
      await result.current.handleUpdateEntry('entry-1', {
        startTime: new Date('2026-04-27T01:00:00.000Z'),
        endTime: new Date('2026-04-27T02:00:00.000Z'),
      });

      expect(updateMutate).toHaveBeenCalledWith(
        {
          id: 'entry-1',
          data: {
            start_time: '2026-04-27T01:00:00.000Z',
            end_time: '2026-04-27T02:00:00.000Z',
            actual_start_time: '2026-04-27T01:00:00.000Z',
            actual_end_time: '2026-04-27T02:00:00.000Z',
          },
        },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('resetActualTime=true でも actual_start_time / actual_end_time は新範囲で送る', async () => {
      getByIdGetData.mockReturnValue({
        id: 'entry-1',
        origin: 'planned',
        start_time: '2026-04-25T00:00:00.000Z',
        end_time: '2026-04-25T01:00:00.000Z',
        actual_start_time: '2026-04-25T00:15:00.000Z',
        actual_end_time: '2026-04-25T00:45:00.000Z',
      });

      const { result } = renderHook(() => useEntryOperations());
      await result.current.handleUpdateEntry('entry-1', {
        startTime: new Date('2026-04-25T01:00:00.000Z'),
        endTime: new Date('2026-04-25T02:00:00.000Z'),
        resetActualTime: true,
      });

      const callArgs = updateMutate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(callArgs.data).toMatchObject({
        start_time: '2026-04-25T01:00:00.000Z',
        end_time: '2026-04-25T02:00:00.000Z',
        actual_start_time: '2026-04-25T01:00:00.000Z',
        actual_end_time: '2026-04-25T02:00:00.000Z',
      });
    });

    it('actual未変更のplannedは過去でもplannedとactualを同じ範囲で送る', async () => {
      getByIdGetData.mockReturnValue({
        id: 'entry-1',
        origin: 'planned',
        start_time: '2026-04-25T00:00:00.000Z',
        end_time: '2026-04-25T01:00:00.000Z',
        actual_start_time: '2026-04-25T00:00:00.000Z',
        actual_end_time: '2026-04-25T01:00:00.000Z',
      });

      const { result } = renderHook(() => useEntryOperations());
      await result.current.handleUpdateEntry('entry-1', {
        startTime: new Date('2026-04-25T01:00:00.000Z'),
        endTime: new Date('2026-04-25T02:00:00.000Z'),
      });

      const callArgs = updateMutate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(callArgs.data).toEqual({
        start_time: '2026-04-25T01:00:00.000Z',
        end_time: '2026-04-25T02:00:00.000Z',
        actual_start_time: '2026-04-25T01:00:00.000Z',
        actual_end_time: '2026-04-25T02:00:00.000Z',
      });
    });

    it('actual差分があるplannedはresetなしならplanned rangeのみを送る', async () => {
      getByIdGetData.mockReturnValue({
        id: 'entry-1',
        origin: 'planned',
        start_time: '2026-04-25T00:00:00.000Z',
        end_time: '2026-04-25T01:00:00.000Z',
        actual_start_time: '2026-04-25T00:15:00.000Z',
        actual_end_time: '2026-04-25T00:45:00.000Z',
      });

      const { result } = renderHook(() => useEntryOperations());
      await result.current.handleUpdateEntry('entry-1', {
        startTime: new Date('2026-04-25T01:00:00.000Z'),
        endTime: new Date('2026-04-25T02:00:00.000Z'),
      });

      const callArgs = updateMutate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(callArgs.data).toEqual({
        start_time: '2026-04-25T01:00:00.000Z',
        end_time: '2026-04-25T02:00:00.000Z',
      });
    });

    it('キャッシュが無い場合は planned と actual を同じ範囲で送る', async () => {
      getByIdGetData.mockReturnValue(null);

      const { result } = renderHook(() => useEntryOperations());
      await result.current.handleUpdateEntry('entry-1', {
        startTime: new Date('2026-04-27T01:00:00.000Z'),
        endTime: new Date('2026-04-27T02:00:00.000Z'),
      });

      const callArgs = updateMutate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(callArgs.data).toMatchObject({
        start_time: '2026-04-27T01:00:00.000Z',
        end_time: '2026-04-27T02:00:00.000Z',
        actual_start_time: '2026-04-27T01:00:00.000Z',
        actual_end_time: '2026-04-27T02:00:00.000Z',
      });
    });

    it('onSuccess で showTimeChangeUndoToast が呼ばれ、Undo 用に prev 時間が toast.action に格納される', async () => {
      getByIdGetData.mockReturnValue({
        id: 'entry-1',
        origin: 'planned',
        start_time: '2026-04-27T00:00:00.000Z',
        end_time: '2026-04-27T00:30:00.000Z',
        actual_start_time: '2026-04-27T00:00:00.000Z',
        actual_end_time: '2026-04-27T00:30:00.000Z',
      });

      const { result } = renderHook(() => useEntryOperations());
      await result.current.handleUpdateEntry('entry-1', {
        startTime: new Date('2026-04-27T01:00:00.000Z'),
        endTime: new Date('2026-04-27T02:00:00.000Z'),
      });

      // mutate に渡された onSuccess を呼んで toast 発火を再現
      const onSuccess = updateMutate.mock.calls[0]?.[1].onSuccess as () => void;
      onSuccess();

      expect(toastSuccess).toHaveBeenCalledTimes(1);
      const [, opts] = toastSuccess.mock.calls[0] as [string, { action: { onClick: () => void } }];
      // Undo クリックで prev 時間が mutate される
      opts.action.onClick();
      expect(updateMutate).toHaveBeenLastCalledWith({
        id: 'entry-1',
        data: {
          start_time: '2026-04-27T00:00:00.000Z',
          end_time: '2026-04-27T00:30:00.000Z',
          actual_start_time: '2026-04-27T00:00:00.000Z',
          actual_end_time: '2026-04-27T00:30:00.000Z',
        },
      });
    });
  });

  describe('handleUpdateEntry: object overload (CalendarEvent)', () => {
    it('startDate が null なら logger.error を出して mutate を呼ばない', async () => {
      const event = makeEvent({ id: 'e1', startDate: null });

      const { result } = renderHook(() => useEntryOperations());
      await result.current.handleUpdateEntry(event);

      expect(loggerError).toHaveBeenCalled();
      expect(updateMutate).not.toHaveBeenCalled();
    });

    it('CalendarEvent の startDate / endDate を ISO で送り Undo toast を仕込む', async () => {
      getByIdGetData.mockReturnValue({
        id: 'e1',
        origin: 'planned',
        start_time: '2026-04-27T00:00:00.000Z',
        end_time: '2026-04-27T01:00:00.000Z',
        actual_start_time: '2026-04-27T00:00:00.000Z',
        actual_end_time: '2026-04-27T01:00:00.000Z',
      });
      const event = makeEvent({ id: 'e1' });

      const { result } = renderHook(() => useEntryOperations());
      await result.current.handleUpdateEntry(event);

      expect(updateMutate).toHaveBeenCalledWith(
        {
          id: 'e1',
          data: {
            start_time: '2026-04-27T01:00:00.000Z',
            end_time: '2026-04-27T02:00:00.000Z',
            actual_start_time: '2026-04-27T01:00:00.000Z',
            actual_end_time: '2026-04-27T02:00:00.000Z',
          },
        },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it('endDate が null なら logger.error を出して mutate を呼ばない', async () => {
      getByIdGetData.mockReturnValue(null);
      const event = makeEvent({ id: 'e1', endDate: null });

      const { result } = renderHook(() => useEntryOperations());
      await result.current.handleUpdateEntry(event);

      expect(loggerError).toHaveBeenCalled();
      expect(updateMutate).not.toHaveBeenCalled();
    });
  });
});
