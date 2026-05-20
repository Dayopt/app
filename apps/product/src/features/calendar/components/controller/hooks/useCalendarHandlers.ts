'use client';

import { useCallback } from 'react';

import { useEntryInspectorStore } from '@/features/entry';
import { logger } from '@/lib/logger';
import { useInlineCreateStore } from '../../../stores/useInlineCreateStore';

import type { CalendarEvent } from '../../../types/calendar.types';

/** エントリクリック・時間範囲選択など、カレンダー共通のUIイベントハンドラーを提供するフック */
export function useCalendarHandlers() {
  const openEntryInspector = useEntryInspectorStore((state) => state.openInspector);
  const inspectorEntryId = useEntryInspectorStore((state) => state.entryId);
  const inspectorIsOpen = useEntryInspectorStore((state) => state.isOpen);

  const setPendingSelection = useInlineCreateStore.use.setPendingSelection();

  // Inspector で開いているエントリーIDをDnD無効化用に計算
  const disabledEntryId = inspectorIsOpen ? inspectorEntryId : null;

  // エントリクリックハンドラー
  const handleEntryClick = useCallback(
    (entry: CalendarEvent) => {
      openEntryInspector(entry.id);

      logger.log('Opening Entry Inspector:', {
        entryId: entry.id,
        title: entry.title,
        origin: entry.origin,
      });
    },
    [openEntryInspector],
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

      logger.log('Calendar Drag Selection:', {
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
    handleEntryClick,
    handleDateTimeRangeSelect,
    /** DnDを無効化するエントリーID（Inspector表示中のエントリー） */
    disabledEntryId,
  };
}
