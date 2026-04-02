import { useCallback } from 'react';

import { useEntryMutations } from '@/features/entry';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { api } from '@/platform/trpc';
import { useTranslations } from 'next-intl';

import type { CalendarEvent } from '../../types/calendar.types';

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
    (entryId: string, previousStartTime: string | null, previousEndTime: string | null) => {
      toast.success(t('entry.toast.updated'), {
        duration: 6000,
        action: {
          label: t('common.undo'),
          onClick: () => {
            updateEntry.mutate({
              id: entryId,
              data: {
                start_time: previousStartTime ?? undefined,
                end_time: previousEndTime ?? undefined,
              },
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
      updates?: { startTime: Date; endTime: Date },
    ) => {
      try {
        if (typeof entryIdOrEntry === 'string' && updates) {
          const entryId = entryIdOrEntry;

          // Undo用に現在の時間をキャッシュから取得
          const cachedEntry = utils.entries.getById.getData({ id: entryId });
          const prevStartTime = cachedEntry?.start_time ?? null;
          const prevEndTime = cachedEntry?.end_time ?? null;

          updateEntry.mutate(
            {
              id: entryId,
              data: {
                start_time: updates.startTime.toISOString(),
                end_time: updates.endTime.toISOString(),
              },
            },
            {
              onSuccess: () => {
                showTimeChangeUndoToast(entryId, prevStartTime, prevEndTime);
              },
            },
          );
        } else if (typeof entryIdOrEntry === 'object') {
          const updatedEntry = entryIdOrEntry;

          if (!updatedEntry.startDate) {
            logger.error('startDateがnullのため更新できません:', updatedEntry.id);
            return;
          }

          // Undo用に現在の時間をキャッシュから取得
          const cachedEntry = utils.entries.getById.getData({ id: updatedEntry.id });
          const prevStartTime = cachedEntry?.start_time ?? null;
          const prevEndTime = cachedEntry?.end_time ?? null;

          updateEntry.mutate(
            {
              id: updatedEntry.id,
              data: {
                start_time: updatedEntry.startDate.toISOString(),
                end_time: updatedEntry.endDate?.toISOString(),
              },
            },
            {
              onSuccess: () => {
                showTimeChangeUndoToast(updatedEntry.id, prevStartTime, prevEndTime);
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
