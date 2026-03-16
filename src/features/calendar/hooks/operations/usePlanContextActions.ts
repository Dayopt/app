'use client';

import { useCallback, useRef } from 'react';

import {
  getInstanceRef,
  useEntryInspectorStore,
  useEntryMutations,
  useRecurringScopeMutations,
} from '@/features/entry';
import { logger } from '@/lib/logger';
import {
  openDeleteConfirm,
  openRecurringEditConfirm,
  type RecurringEditScope,
} from '@/shell/stores/useModalStore';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useEntryClipboardStore } from '../stores/useEntryClipboardStore';
import type { CalendarEvent } from '../types/calendar.types';

export function usePlanContextActions() {
  const t = useTranslations();
  const openInspector = useEntryInspectorStore((s) => s.openInspector);
  const { deleteEntry, createEntry } = useEntryMutations();
  const { applyDelete } = useRecurringScopeMutations();

  // 繰り返しプラン削除用のターゲットをrefで保持（ダイアログのコールバックで参照）
  const recurringDeleteTargetRef = useRef<CalendarEvent | null>(null);

  // 繰り返しプラン削除確認ハンドラー（ダイアログのコールバック）
  const handleRecurringDeleteConfirm = useCallback(
    async (scope: RecurringEditScope) => {
      const target = recurringDeleteTargetRef.current;
      if (!target) return;

      try {
        const ref = getInstanceRef(target);
        if (!ref) return;

        await applyDelete({
          scope,
          planId: ref.parentEntryId,
          instanceDate: ref.instanceDate,
        });
      } finally {
        recurringDeleteTargetRef.current = null;
      }
    },
    [applyDelete],
  );

  const handleDeletePlan = useCallback(
    (plan: CalendarEvent) => {
      // 繰り返しプランの場合はスコープ選択ダイアログを表示
      if (plan.isRecurring) {
        recurringDeleteTargetRef.current = plan;
        openRecurringEditConfirm(plan.title, 'delete', handleRecurringDeleteConfirm);
        return;
      }

      // 通常プラン: カスタム削除確認ダイアログを使用
      const planIdToDelete = plan.calendarId || plan.id;
      openDeleteConfirm(planIdToDelete, plan.title, async () => {
        await deleteEntry.mutateAsync({ id: planIdToDelete });
      });
    },
    [deleteEntry, handleRecurringDeleteConfirm],
  );

  const handleEditPlan = useCallback(
    (plan: CalendarEvent) => {
      // planInspectorを開いて編集モードにする
      // 繰り返しプランの場合はインスタンス日付を渡す
      const ref = plan.isRecurring ? getInstanceRef(plan) : null;
      const instanceDate = ref?.instanceDate ?? plan.startDate?.toISOString().slice(0, 10);

      openInspector(plan.calendarId || plan.id, instanceDate ? { instanceDate } : undefined);
    },
    [openInspector],
  );

  const handleDuplicatePlan = useCallback(
    async (plan: CalendarEvent) => {
      const startTime = plan.startDate ? plan.startDate.toISOString() : undefined;
      const endTime = plan.endDate ? plan.endDate.toISOString() : undefined;

      // 即DB作成 → Inspector edit mode で開く
      try {
        const result = await createEntry.mutateAsync({
          title: `${plan.title} (copy)`,
          description: plan.description ?? undefined,
          start_time: startTime,
          end_time: endTime,
        });
        if (result?.id) {
          openInspector(result.id);
        }
      } catch {
        logger.error('Failed to duplicate entry');
      }
    },
    [createEntry, openInspector],
  );

  const handleCopyPlan = useCallback(
    (plan: CalendarEvent) => {
      const startHour = plan.startDate?.getHours() ?? 0;
      const startMinute = plan.startDate?.getMinutes() ?? 0;
      const duration =
        plan.endDate && plan.startDate
          ? (plan.endDate.getTime() - plan.startDate.getTime()) / 60000
          : 60;

      useEntryClipboardStore.getState().copyEntry({
        title: plan.title,
        description: plan.description ?? null,
        duration,
        startHour,
        startMinute,
        tagId: plan.tagId,
      });

      toast.success(t('common.toast.copied'));
    },
    [t],
  );

  /**
   * コピーしたプランをペースト
   * @param targetDate ペースト先の日付
   * @param targetHour ペースト先の時（指定しない場合はコピー元の時刻を使用）
   * @param targetMinute ペースト先の分（指定しない場合はコピー元の分を使用）
   */
  const handlePastePlan = useCallback(
    async (targetDate: Date, targetHour?: number, targetMinute?: number) => {
      const clipboard = useEntryClipboardStore.getState();
      const copiedEntry = clipboard.copiedEntry;
      if (!copiedEntry) return;

      // ペースト先の日付 + 指定時刻（なければコピー元の時刻）
      const startTime = new Date(targetDate);
      const hour = targetHour ?? copiedEntry.startHour;
      const minute = targetMinute ?? copiedEntry.startMinute;
      startTime.setHours(hour, minute, 0, 0);

      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + copiedEntry.duration);

      // 即DB作成 → Inspector edit mode で開く
      try {
        const result = await createEntry.mutateAsync({
          title: copiedEntry.title,
          description: copiedEntry.description ?? undefined,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
        });
        if (result?.id) {
          openInspector(result.id);
        }
      } catch {
        logger.error('Failed to paste entry');
      }
    },
    [createEntry, openInspector],
  );

  const handleCompleteWithRecord = useCallback(
    async (plan: CalendarEvent) => {
      // 即DB作成 → Inspector edit mode で開く
      try {
        const result = await createEntry.mutateAsync({
          title: plan.title,
          start_time: plan.startDate?.toISOString() ?? undefined,
          end_time: plan.endDate?.toISOString() ?? undefined,
        });
        if (result?.id) {
          openInspector(result.id);
        }
      } catch {
        logger.error('Failed to create entry from plan');
      }
    },
    [createEntry, openInspector],
  );

  return {
    handleDeletePlan,
    handleEditPlan,
    handleDuplicatePlan,
    handleCopyPlan,
    handlePastePlan,
    handleCompleteWithRecord,
  };
}
