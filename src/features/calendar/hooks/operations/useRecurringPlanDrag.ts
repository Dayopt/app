'use client';

/**
 * 繰り返しプランのドラッグ移動フック
 *
 * 繰り返しインスタンスのドラッグ移動時にスコープ選択ダイアログを表示し、
 * 選択に応じて適切な更新処理を行う（Googleカレンダー準拠）
 *
 * entries 統合: Plan/Record 区別なし、全エントリに同じ更新ロジックを適用
 */

import { useCallback, useRef } from 'react';

import {
  computeOriginTransition,
  useEntryMutations,
  useRecurringScopeMutations,
} from '@/features/entry';
import { logger } from '@/lib/logger';
import { openRecurringEditConfirm, type RecurringEditScope } from '@/shell/stores/useModalStore';

import type { CalendarEvent } from '../types/calendar.types';

interface PendingDragUpdate {
  plan: CalendarEvent;
  /** 繰り返しインスタンスの親エントリID（ガード済み） */
  parentEntryId: string;
  /** 繰り返しインスタンスの日付（ガード済み） */
  instanceDate: string;
  updates: { startTime: Date; endTime: Date };
}

interface UseRecurringPlanDragOptions {
  /** 全プラン配列（繰り返しインスタンス情報を含む） */
  plans: CalendarEvent[];
}

export function useRecurringPlanDrag({ plans }: UseRecurringPlanDragOptions) {
  const { updateEntry } = useEntryMutations();
  const { applyEdit } = useRecurringScopeMutations();

  // 保留中のドラッグ更新（refで保持してダイアログのコールバックで参照）
  const pendingDragUpdateRef = useRef<PendingDragUpdate | null>(null);

  /**
   * スコープ選択後の処理
   */
  const handleScopeConfirm = useCallback(
    async (scope: RecurringEditScope) => {
      const pendingDragUpdate = pendingDragUpdateRef.current;
      if (!pendingDragUpdate) return;

      const { plan: _plan, parentEntryId, instanceDate, updates } = pendingDragUpdate;
      const newDate = updates.startTime.toISOString().slice(0, 10);

      try {
        await applyEdit({
          scope,
          planId: parentEntryId,
          instanceDate,
          changes: {
            start_time: updates.startTime.toISOString(),
            end_time: updates.endTime.toISOString(),
          },
          targetDate: newDate,
        });
      } catch (error) {
        logger.error('繰り返しプランの更新に失敗:', error);
      } finally {
        pendingDragUpdateRef.current = null;
      }
    },
    [applyEdit],
  );

  /**
   * エントリ更新ハンドラー（ドラッグ&ドロップ用）
   * 繰り返しインスタンスの場合はダイアログを表示
   */
  const handleUpdatePlan = useCallback(
    async (
      planIdOrPlan: string | CalendarEvent,
      updates?: { startTime: Date; endTime: Date },
    ): Promise<{ skipToast: true } | void> => {
      let plan: CalendarEvent | undefined;
      let resolvedUpdates: { startTime: Date; endTime: Date } | undefined;

      if (typeof planIdOrPlan === 'string' && updates) {
        plan = plans.find((p) => p.id === planIdOrPlan);
        resolvedUpdates = updates;
      } else if (typeof planIdOrPlan === 'object') {
        plan = planIdOrPlan;
        if (plan.startDate && plan.endDate) {
          resolvedUpdates = {
            startTime: plan.startDate,
            endTime: plan.endDate,
          };
        }
      }

      if (!plan) {
        logger.warn('Entry not found for update:', planIdOrPlan);
        return;
      }

      if (!resolvedUpdates) {
        logger.warn('No updates provided for entry:', plan.id);
        return;
      }

      // 繰り返しインスタンスかどうか判定
      if (plan.isRecurring && plan.originalEntryId && plan.instanceDate) {
        pendingDragUpdateRef.current = {
          plan,
          parentEntryId: plan.originalEntryId,
          instanceDate: plan.instanceDate,
          updates: resolvedUpdates,
        };
        openRecurringEditConfirm(plan.title, 'edit', handleScopeConfirm);
        return { skipToast: true };
      } else {
        // 通常エントリ: origin 遷移を計算してから更新
        const transition = computeOriginTransition(
          plan.origin ?? 'planned',
          resolvedUpdates.startTime,
          resolvedUpdates.endTime,
        );
        updateEntry.mutate({
          id: plan.id,
          data: {
            start_time: resolvedUpdates.startTime.toISOString(),
            end_time: resolvedUpdates.endTime.toISOString(),
            ...(transition.clearFields && { ...transition.clearFields, origin: transition.origin }),
          },
        });
      }
    },
    [plans, updateEntry, handleScopeConfirm],
  );

  return {
    handleUpdatePlan,
  };
}
