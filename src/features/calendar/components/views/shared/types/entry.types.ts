/**
 * エントリ関連の型定義
 */

import type { CalendarEvent } from '../../../../types/calendar.types';

// 時間指定エントリ（start/endを持つエントリ）
// CalendarEventの startDate/endDate を start/end に変換した型
export type TimedEntry = CalendarEvent & {
  start: Date; // startDateのエイリアス
  end: Date; // endDateのエイリアス
  isReadOnly?: boolean;
};

export interface EntryGroup {
  entries: CalendarEvent[];
  columns: EntryColumn[];
}

export interface EntryColumn {
  entries: CalendarEvent[];
  columnIndex: number;
  totalColumns: number;
}

export type EntryInteractionHandler = {
  onClick?: (entry: CalendarEvent) => void;
  onContextMenu?: (entry: CalendarEvent, e: React.MouseEvent) => void;
  onDragStart?: (entry: CalendarEvent) => void;
  onDragEnd?: (entry: CalendarEvent) => void;
  onDragOver?: (entry: CalendarEvent, date: Date, time: Date) => void;
  onDrop?: (entry: CalendarEvent, date: Date, time: Date) => void;
  onResize?: (entry: CalendarEvent, newStart: Date, newEnd: Date) => void;
};
