import { useCallback } from 'react';

import {
  buildTimeUpdateData,
  buildUndoTimeUpdateData,
  useEntryMutations,
  type EntryLike,
} from '@/features/entry';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { api } from '@/lib/trpc';
import { useTranslations } from 'next-intl';

import type { CalendarEvent } from '../../types/calendar.types';

function entryFromCalendarEvent(event: CalendarEvent): EntryLike {
  const plannedStartDate =
    event.plannedStartDate ?? (event.origin === 'planned' ? event.startDate : null);
  const plannedEndDate =
    event.plannedEndDate ?? (event.origin === 'planned' ? event.endDate : null);

  return {
    origin: event.origin ?? null,
    start_time: plannedStartDate?.toISOString() ?? null,
    end_time: plannedEndDate?.toISOString() ?? null,
    // 自動記録モデル: actual はユーザー確定値のみ（NULL = 未編集）。
    // unplanned だけは表示位置 = actual なので startDate を fallback に使う
    actual_start_time:
      (
        event.actualStartDate ?? (event.origin === 'unplanned' ? event.startDate : null)
      )?.toISOString() ?? null,
    actual_end_time:
      (
        event.actualEndDate ?? (event.origin === 'unplanned' ? event.endDate : null)
      )?.toISOString() ?? null,
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
    (entryId: string, previousEntry: EntryLike | null | undefined, resetActualTime = false) => {
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
