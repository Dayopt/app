/**
 * エントリ関連の型定義
 */

import type { CalendarEvent } from './calendar.types';

/** 時間指定エントリ型（startDate/endDateをstart/endにエイリアス） */
export type TimedEntry = CalendarEvent & {
  start: Date; // startDateのエイリアス
  end: Date; // endDateのエイリアス
  isReadOnly?: boolean;
};

/** 重複グループ化されたエントリ群 */
export interface EntryGroup {
  entries: CalendarEvent[];
  columns: EntryColumn[];
}

/** カラム割り当て済みのエントリ列情報 */
export interface EntryColumn {
  entries: CalendarEvent[];
  columnIndex: number;
  totalColumns: number;
}

/** エントリのインタラクションハンドラー型 */
export type EntryInteractionHandler = {
  onClick?: (entry: CalendarEvent) => void;
  onContextMenu?: (entry: CalendarEvent, e: React.MouseEvent) => void;
  onDragStart?: (entry: CalendarEvent) => void;
  onDragEnd?: (entry: CalendarEvent) => void;
  onDragOver?: (entry: CalendarEvent, date: Date, time: Date) => void;
  onDrop?: (entry: CalendarEvent, date: Date, time: Date) => void;
  onResize?: (entry: CalendarEvent, newStart: Date, newEnd: Date) => void;
};
