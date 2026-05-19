import { useCallback } from 'react';

import { useEntryMutations } from '@/features/entry';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { api } from '@/lib/trpc';
import { useTranslations } from 'next-intl';

import type { CalendarEvent } from '../../types/calendar.types';

type TimeUpdateEntry = {
  origin?: string | null | undefined;
  start_time?: string | null;
  end_time?: string | null;
  actual_start_time?: string | null;
  actual_end_time?: string | null;
};

function rangesMatch(
  firstStart: string | null | undefined,
  firstEnd: string | null | undefined,
  secondStart: string | null | undefined,
  secondEnd: string | null | undefined,
): boolean {
  return firstStart === secondStart && firstEnd === secondEnd;
}

function hasActualDiff(entry: TimeUpdateEntry | null | undefined): boolean {
  if (entry?.origin !== 'planned') return false;
  return !rangesMatch(
    entry.start_time,
    entry.end_time,
    entry.actual_start_time,
    entry.actual_end_time,
  );
}

function buildTimeUpdateData(
  entry: TimeUpdateEntry | null | undefined,
  startTime: Date,
  endTime: Date,
  resetActualTime = false,
): {
  start_time?: string | null;
  end_time?: string | null;
  actual_start_time?: string | null;
  actual_end_time?: string | null;
} {
  const startISO = startTime.toISOString();
  const endISO = endTime.toISOString();

  if (entry?.origin === 'planned' && resetActualTime) {
    return {
      start_time: startISO,
      end_time: endISO,
      actual_start_time: startISO,
      actual_end_time: endISO,
    };
  }

  if (entry?.origin === 'unplanned') {
    return {
      actual_start_time: startISO,
      actual_end_time: endISO,
    };
  }

  if (entry?.origin === 'planned' && hasActualDiff(entry) && !resetActualTime) {
    return {
      start_time: startISO,
      end_time: endISO,
    };
  }

  if (entry?.origin === 'planned' || !entry) {
    return {
      start_time: startISO,
      end_time: endISO,
      actual_start_time: startISO,
      actual_end_time: endISO,
    };
  }

  return {
    actual_start_time: startISO,
    actual_end_time: endISO,
  };
}

function buildUndoTimeUpdateData(
  entry: TimeUpdateEntry | null | undefined,
  resetActualTime = false,
): ReturnType<typeof buildTimeUpdateData> | null {
  if (!entry) return null;

  if (entry.origin === 'unplanned') {
    if (!entry.actual_start_time || !entry.actual_end_time) return null;
    return {
      actual_start_time: entry.actual_start_time,
      actual_end_time: entry.actual_end_time,
    };
  }

  if (resetActualTime) {
    if (
      !entry.start_time ||
      !entry.end_time ||
      !entry.actual_start_time ||
      !entry.actual_end_time
    ) {
      return null;
    }
    return {
      start_time: entry.start_time,
      end_time: entry.end_time,
      actual_start_time: entry.actual_start_time,
      actual_end_time: entry.actual_end_time,
    };
  }

  if (entry.origin === 'planned' && hasActualDiff(entry)) {
    if (!entry.start_time || !entry.end_time) return null;
    return {
      start_time: entry.start_time,
      end_time: entry.end_time,
    };
  }

  if (!entry.start_time || !entry.end_time || !entry.actual_start_time || !entry.actual_end_time) {
    return null;
  }
  return {
    start_time: entry.start_time,
    end_time: entry.end_time,
    actual_start_time: entry.actual_start_time,
    actual_end_time: entry.actual_end_time,
  };
}

function entryFromCalendarEvent(event: CalendarEvent): TimeUpdateEntry {
  const plannedStartDate =
    event.plannedStartDate ?? (event.origin === 'planned' ? event.startDate : null);
  const plannedEndDate =
    event.plannedEndDate ?? (event.origin === 'planned' ? event.endDate : null);

  return {
    origin: event.origin,
    start_time: plannedStartDate?.toISOString() ?? null,
    end_time: plannedEndDate?.toISOString() ?? null,
    actual_start_time: (event.actualStartDate ?? event.startDate)?.toISOString() ?? null,
    actual_end_time: (event.actualEndDate ?? event.endDate)?.toISOString() ?? null,
  };
}

/**
 * エントリー操作（CRUD）を提供するフック
 * エントリーの削除、復元、更新を管理
 */
export const useEntryOperations = () => {
  const { updateEntry, deleteEntry } = useEntryMutations();
  const utils = api.useUtils();
  const t = useTranslations();

  /**
   * 時間変更のUndo toastを表示
   * ドラッグ/リサイズで時間が変わった場合にのみ呼び出す
   */
  const showTimeChangeUndoToast = useCallback(
    (
      entryId: string,
      previousEntry: TimeUpdateEntry | null | undefined,
      resetActualTime = false,
    ) => {
      const undoData = buildUndoTimeUpdateData(previousEntry, resetActualTime);
      if (!undoData) return;

      toast.success(t('entry.toast.updated'), {
        duration: 6000,
        action: {
          label: t('common.undo'),
          onClick: () => {
            updateEntry.mutate({
              id: entryId,
              data: undoData,
            });
          },
        },
      });
    },
    [updateEntry, t],
  );

  // エントリー削除ハンドラー
  const handleEntryDelete = useCallback(
    async (entryId: string) => {
      try {
        deleteEntry.mutate({ id: entryId });
      } catch (error) {
        logger.error('エントリー削除に失敗:', error);
      }
    },
    [deleteEntry],
  );

  // エントリー更新ハンドラー（ドラッグ&ドロップ用）
  const handleUpdateEntry = useCallback(
    async (
      entryIdOrEntry: string | CalendarEvent,
      updates?: { startTime: Date; endTime: Date; resetActualTime?: boolean },
    ) => {
      try {
        if (typeof entryIdOrEntry === 'string' && updates) {
          const entryId = entryIdOrEntry;

          // Undo用に現在の時間をキャッシュから取得
          const cachedEntry = utils.entries.getById.getData({ id: entryId });

          updateEntry.mutate(
            {
              id: entryId,
              data: buildTimeUpdateData(
                cachedEntry,
                updates.startTime,
                updates.endTime,
                updates.resetActualTime,
              ),
            },
            {
              onSuccess: () => {
                showTimeChangeUndoToast(entryId, cachedEntry, updates.resetActualTime);
              },
            },
          );
        } else if (typeof entryIdOrEntry === 'object') {
          const updatedEntry = entryIdOrEntry;

          if (!updatedEntry.startDate || !updatedEntry.endDate) {
            logger.error('startDate/endDateがnullのため更新できません:', updatedEntry.id);
            return;
          }

          // Undo用に現在の時間をキャッシュから取得
          const cachedEntry = utils.entries.getById.getData({ id: updatedEntry.id });
          const currentEntry = cachedEntry ?? entryFromCalendarEvent(updatedEntry);

          updateEntry.mutate(
            {
              id: updatedEntry.id,
              data: buildTimeUpdateData(currentEntry, updatedEntry.startDate, updatedEntry.endDate),
            },
            {
              onSuccess: () => {
                showTimeChangeUndoToast(updatedEntry.id, currentEntry);
              },
            },
          );
        }
      } catch (error) {
        logger.error('エントリー更新に失敗:', error);
      }
    },
    [updateEntry, utils, showTimeChangeUndoToast],
  );

  return {
    handleEntryDelete,
    handleUpdateEntry,
  };
};
