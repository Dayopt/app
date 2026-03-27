import { useCallback } from 'react';

import { useEntryMutations } from '@/features/entry';
import { logger } from '@/lib/logger';

import type { CalendarEvent } from '../../types/calendar.types';

/**
 * エントリー操作（CRUD）を提供するフック
 * エントリーの削除、復元、更新を管理
 */
export const useEntryOperations = () => {
  const { updateEntry, deleteEntry } = useEntryMutations();

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
          updateEntry.mutate({
            id: entryId,
            data: {
              start_time: updates.startTime.toISOString(),
              end_time: updates.endTime.toISOString(),
            },
          });
        } else if (typeof entryIdOrEntry === 'object') {
          const updatedEntry = entryIdOrEntry;

          if (!updatedEntry.startDate) {
            logger.error('startDateがnullのため更新できません:', updatedEntry.id);
            return;
          }

          logger.log('エントリー更新 (CalendarEvent形式):', {
            entryId: updatedEntry.id,
            newStartDate: updatedEntry.startDate.toISOString(),
            newEndDate: updatedEntry.endDate?.toISOString(),
          });

          updateEntry.mutate({
            id: updatedEntry.id,
            data: {
              start_time: updatedEntry.startDate.toISOString(),
              end_time: updatedEntry.endDate?.toISOString(),
            },
          });
        }
      } catch (error) {
        logger.error('エントリー更新に失敗:', error);
      }
    },
    [updateEntry],
  );

  return {
    handleEntryDelete,
    handleUpdateEntry,
  };
};
