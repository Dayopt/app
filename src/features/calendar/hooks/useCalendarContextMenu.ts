import { useCallback, useState } from 'react';

import type { CalendarEvent } from '../types/calendar.types';

/**
 * カレンダープランのコンテキストメニュー状態を管理するフック
 */
export const useCalendarContextMenu = () => {
  const [contextMenuEvent, setContextMenuEvent] = useState<CalendarEvent | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(
    null,
  );

  // プランの右クリックハンドラー（タッチデバイスでは無効）
  const handleEventContextMenu = useCallback(
    (plan: CalendarEvent, mouseEvent: React.MouseEvent) => {
      // タッチデバイスからの contextmenu イベントは無視（長押しで発火するため）
      if (window.matchMedia('(pointer: coarse)').matches) return;
      setContextMenuEvent(plan);
      setContextMenuPosition({ x: mouseEvent.clientX, y: mouseEvent.clientY });
    },
    [],
  );

  // コンテキストメニューを閉じる
  const handleCloseContextMenu = useCallback(() => {
    setContextMenuEvent(null);
    setContextMenuPosition(null);
  }, []);

  return {
    contextMenuEvent,
    contextMenuPosition,
    handleEventContextMenu,
    handleCloseContextMenu,
  };
};
