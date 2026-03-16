import { useCallback } from 'react';

import { decodeInstanceId, useEntryInstanceMutations, useEntryMutations } from '@/features/entry';
import { logger } from '@/lib/logger';
import { api } from '@/platform/trpc';

import type { CalendarEvent } from '../types/calendar.types';

/**
 * プラン操作（CRUD）を提供するフック
 * プランの削除、復元、更新、自動クリーンアップを管理
 * 繰り返しインスタンスのドラッグ移動にも対応
 */
export const usePlanOperations = () => {
  const utils = api.useUtils();
  const { updateEntry, deleteEntry } = useEntryMutations();
  const { createInstance } = useEntryInstanceMutations();

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

  // プラン復元ハンドラー
  const handlePlanRestore = useCallback(async (_plan: CalendarEvent) => {
    // noop - planにはソフトデリート機能がないため、復元は未実装
  }, []);

  // プラン更新ハンドラー（ドラッグ&ドロップ用）
  // 繰り返しインスタンスの場合はmoved/modified例外を作成
  const handleUpdatePlan = useCallback(
    async (planIdOrPlan: string | CalendarEvent, updates?: { startTime: Date; endTime: Date }) => {
      try {
        // ドラッグ&ドロップからの呼び出し（planId + updates形式）
        if (typeof planIdOrPlan === 'string' && updates) {
          const planId = planIdOrPlan;
          const decoded = decodeInstanceId(planId);

          if (decoded) {
            // 繰り返しインスタンスの移動: moved/modified例外を作成
            const newDate = updates.startTime.toISOString().slice(0, 10);
            const isSameDate = decoded.instanceDate === newDate;

            logger.log('🔄 繰り返しインスタンスの移動:', {
              parentEntryId: decoded.parentEntryId,
              instanceDate: decoded.instanceDate,
              newDate,
              isSameDate,
            });

            await createInstance.mutateAsync({
              entryId: decoded.parentEntryId,
              instanceDate: decoded.instanceDate,
              exceptionType: isSameDate ? 'modified' : 'moved',
              instanceStart: updates.startTime.toISOString(),
              instanceEnd: updates.endTime.toISOString(),
              // moved例外の場合、新しい日付を記録
              ...(isSameDate ? {} : { originalDate: newDate }),
            });

            // キャッシュを更新
            utils.entries.list.invalidate();
            utils.entries.getInstances.invalidate();
          } else {
            // 通常プランの更新
            updateEntry.mutate({
              id: planId,
              data: {
                start_time: updates.startTime.toISOString(),
                end_time: updates.endTime.toISOString(),
              },
            });
          }
        }
        // CalendarEventオブジェクト形式
        else if (typeof planIdOrPlan === 'object') {
          const updatedPlan = planIdOrPlan;

          // startDateがnullの場合は早期リターン
          if (!updatedPlan.startDate) {
            logger.error('❌ startDateがnullのため更新できません:', updatedPlan.id);
            return;
          }

          // 繰り返しインスタンスの判定
          const decoded = decodeInstanceId(updatedPlan.id);

          if (decoded) {
            // 繰り返しインスタンスの移動
            const newDate = updatedPlan.startDate.toISOString().slice(0, 10);
            const isSameDate = decoded.instanceDate === newDate;

            logger.log('🔄 繰り返しインスタンスの移動 (CalendarEvent形式):', {
              parentEntryId: decoded.parentEntryId,
              instanceDate: decoded.instanceDate,
              newDate,
              isSameDate,
            });

            await createInstance.mutateAsync({
              entryId: decoded.parentEntryId,
              instanceDate: decoded.instanceDate,
              exceptionType: isSameDate ? 'modified' : 'moved',
              instanceStart: updatedPlan.startDate.toISOString(),
              instanceEnd: updatedPlan.endDate?.toISOString(),
              ...(isSameDate ? {} : { originalDate: newDate }),
            });

            utils.entries.list.invalidate();
            utils.entries.getInstances.invalidate();
          } else {
            // 通常プランの更新
            logger.log('🔧 プラン更新 (CalendarEvent形式):', {
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
        }
      } catch (error) {
        logger.error('プラン更新に失敗:', error);
      }
    },
    [updateEntry, createInstance, utils],
  );

  return {
    handlePlanDelete,
    handlePlanRestore,
    handleUpdatePlan,
  };
};
