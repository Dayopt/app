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

/** カラム割り当て済みのエントリ列情報 */
export interface EntryColumn {
  entries: CalendarEvent[];
  columnIndex: number;
  totalColumns: number;
}
