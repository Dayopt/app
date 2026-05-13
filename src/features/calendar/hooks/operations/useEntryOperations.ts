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

function buildTimeUpdateData(
  entry: TimeUpdateEntry | null | undefined,
  startTime: Date,
  endTime: Date,
): {
  start_time?: string | null;
  end_time?: string | null;
  actual_start_time?: string | null;
  actual_end_time?: string | null;
} {
  const startISO = startTime.toISOString();
  const endISO = endTime.toISOString();

  if (entry?.origin === 'unplanned') {
    return {
      actual_start_time: startISO,
      actual_end_time: endISO,
    };
  }

  const isFuturePlanned =
    entry?.origin === 'planned' &&
    entry.start_time !== null &&
    entry.start_time !== undefined &&
    new Date(entry.start_time).getTime() > Date.now();

  if (isFuturePlanned || !entry) {
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

function getPreviousUpdateRange(
  entry: TimeUpdateEntry | null | undefined,
): { start: Date; end: Date } | null {
  if (!entry) return null;

  const isFuturePlanned =
    entry.origin === 'planned' &&
    entry.start_time !== null &&
    entry.start_time !== undefined &&
    new Date(entry.start_time).getTime() > Date.now();
  const useActualRange = entry.origin === 'unplanned' || !isFuturePlanned;
  const start = useActualRange ? entry.actual_start_time : entry.start_time;
  const end = useActualRange ? entry.actual_end_time : entry.end_time;

  if (!start || !end) return null;
  return { start: new Date(start), end: new Date(end) };
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
    (entryId: string, previousEntry: TimeUpdateEntry | null | undefined) => {
      const previousRange = getPreviousUpdateRange(previousEntry);
      if (!previousRange) return;

      toast.success(t('entry.toast.updated'), {
        duration: 6000,
        action: {
          label: t('common.undo'),
          onClick: () => {
            updateEntry.mutate({
              id: entryId,
              data: buildTimeUpdateData(previousEntry, previousRange.start, previousRange.end),
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
              data: buildTimeUpdateData(cachedEntry, updates.startTime, updates.endTime),
            },
            {
              onSuccess: () => {
                showTimeChangeUndoToast(entryId, cachedEntry);
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
