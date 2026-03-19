'use client';

import { useCallback } from 'react';

import { getInstanceRef, useEntryInspectorStore } from '@/features/entry';
import { logger } from '@/lib/logger';
import { closeModal, useModalStore } from '@/stores/useModalStore';
import { useInlineCreateStore } from '../../../stores/useInlineCreateStore';

import type { CalendarEvent } from '../../../types/calendar.types';

export function useCalendarHandlers() {
  const openPlanInspector = useEntryInspectorStore((state) => state.openInspector);
  const inspectorPlanId = useEntryInspectorStore((state) => state.entryId);
  const inspectorIsOpen = useEntryInspectorStore((state) => state.isOpen);

  const setPendingSelection = useInlineCreateStore.use.setPendingSelection();

  // Inspector で開いているプランIDをDnD無効化用に計算
  const disabledPlanId = inspectorIsOpen ? inspectorPlanId : null;

  // エントリクリックハンドラー（Plan/Record 統一）
  const handlePlanClick = useCallback(
    (plan: CalendarEvent) => {
      // ドラッグ操作で開いたダイアログが残っている場合は閉じる
      const modal = useModalStore.getState().modal;
      if (modal?.type === 'recurringEdit') closeModal();

      // 繰り返しインスタンスの場合は親エントリIDを使用
      const entryIdToOpen = plan.calendarId ?? plan.id;

      // 繰り返しプランの場合はインスタンス日付を渡す
      const ref = plan.isRecurring ? getInstanceRef(plan) : null;
      const instanceDateRaw = ref?.instanceDate ?? plan.startDate?.toISOString().slice(0, 10);

      openPlanInspector(
        entryIdToOpen,
        instanceDateRaw && plan.isRecurring ? { instanceDate: instanceDateRaw } : undefined,
      );

      logger.log('📋 Opening Entry Inspector:', {
        entryId: entryIdToOpen,
        title: plan.title,
        origin: plan.origin,
        isRecurringInstance: !!plan.calendarId,
        instanceDate: instanceDateRaw,
      });
    },
    [openPlanInspector],
  );

  // 統一された時間範囲選択ハンドラー（全ビュー共通）
  // ドラッグ/ダブルクリック/タップ → InlineTagPalette 表示
  const handleDateTimeRangeSelect = useCallback(
    (selection: {
      date: Date;
      startHour: number;
      startMinute: number;
      endHour: number;
      endMinute: number;
    }) => {
      // 最小15分制約の適用
      const startMinutes = selection.startHour * 60 + selection.startMinute;
      let endMinutes = selection.endHour * 60 + selection.endMinute;
      if (endMinutes - startMinutes < 15) {
        endMinutes = startMinutes + 15;
      }

      logger.log('📅 Calendar Drag Selection → InlineTagPalette:', {
        date: selection.date.toDateString(),
        start: `${selection.startHour}:${String(selection.startMinute).padStart(2, '0')}`,
        end: `${Math.floor(endMinutes / 60)}:${String(endMinutes % 60).padStart(2, '0')}`,
      });

      setPendingSelection({
        date: selection.date,
        startHour: selection.startHour,
        startMinute: selection.startMinute,
        endHour: Math.floor(endMinutes / 60),
        endMinute: endMinutes % 60,
      });
    },
    [setPendingSelection],
  );

  return {
    handlePlanClick,
    handleDateTimeRangeSelect,
    /** DnDを無効化するプランID（Inspector表示中のプラン） */
    disabledPlanId,
  };
}
