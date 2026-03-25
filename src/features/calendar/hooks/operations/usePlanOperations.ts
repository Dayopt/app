import { useCallback } from 'react';

import { useEntryMutations } from '@/features/entry';
import { logger } from '@/lib/logger';

import type { CalendarEvent } from '../../types/calendar.types';

/**
 * プラン操作（CRUD）を提供するフック
 * プランの削除、復元、更新を管理
 */
export const usePlanOperations = () => {
  const { updateEntry, deleteEntry } = useEntryMutations();

  // プラン削除ハンドラー
  const handlePlanDelete = useCallback(
    async (planId: string) => {
      try {
        deleteEntry.mutate({ id: planId });
      } catch (error) {
        logger.error('プラン削除に失敗:', error);
      }
    },
    [deleteEntry],
  );

  // プラン更新ハンドラー（ドラッグ&ドロップ用）
  const handleUpdatePlan = useCallback(
    async (planIdOrPlan: string | CalendarEvent, updates?: { startTime: Date; endTime: Date }) => {
      try {
        if (typeof planIdOrPlan === 'string' && updates) {
          const planId = planIdOrPlan;
          updateEntry.mutate({
            id: planId,
            data: {
              start_time: updates.startTime.toISOString(),
              end_time: updates.endTime.toISOString(),
            },
          });
        } else if (typeof planIdOrPlan === 'object') {
          const updatedPlan = planIdOrPlan;

          if (!updatedPlan.startDate) {
            logger.error('startDateがnullのため更新できません:', updatedPlan.id);
            return;
          }

          logger.log('プラン更新 (CalendarEvent形式):', {
            planId: updatedPlan.id,
            newStartDate: updatedPlan.startDate.toISOString(),
            newEndDate: updatedPlan.endDate?.toISOString(),
          });

          updateEntry.mutate({
            id: updatedPlan.id,
            data: {
              start_time: updatedPlan.startDate.toISOString(),
              end_time: updatedPlan.endDate?.toISOString(),
            },
          });
        }
      } catch (error) {
        logger.error('プラン更新に失敗:', error);
      }
    },
    [updateEntry],
  );

  return {
    handlePlanDelete,
    handleUpdatePlan,
  };
};
