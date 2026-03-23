'use client';

import { useCallback } from 'react';

import { useEntryInspectorStore, useEntryMutations } from '@/features/entry';
import { logger } from '@/lib/logger';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useEntryClipboardStore } from '../../stores/useEntryClipboardStore';
import type { CalendarEvent } from '../../types/calendar.types';

/** コンテキストメニューで使用するプラン操作アクション（削除・編集・複製・コピー・ペースト・完了）を提供するフック */
export function usePlanContextActions() {
  const t = useTranslations();
  const openInspector = useEntryInspectorStore((s) => s.openInspector);
  const { deleteEntry, createEntry } = useEntryMutations();

  const handleDeletePlan = useCallback(
    (plan: CalendarEvent) => {
      deleteEntry.mutate({ id: plan.id });
    },
    [deleteEntry],
  );

  const handleEditPlan = useCallback(
    (plan: CalendarEvent) => {
      openInspector(plan.id);
    },
    [openInspector],
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
    handleCopyPlan,
    handlePastePlan,
    handleCompleteWithRecord,
  };
}
