import type { CSSProperties } from 'react';

import type { GridViewProps } from './base.types';
import type { CalendarEvent } from './calendar.types';
import type { TimeSlot } from './grid.types';

/** DayViewの固有Props（GridViewPropsを継承して時間グリッド機能を使用） */
export type DayViewProps = GridViewProps;

/** useDayView フックのオプション */
export interface UseDayViewOptions {
  date: Date;
  entries: CalendarEvent[];
  onEntryUpdate?: (entry: CalendarEvent) => void;
  timezone: string;
}

/** useDayView フックの戻り値 */
export interface UseDayViewReturn {
  dayEntries: CalendarEvent[];
  entryStyles: Record<string, CSSProperties>;
  isToday: boolean;
  timeSlots: TimeSlot[];
}

/** useDayEntries フックのオプション */
export interface UseDayEntriesOptions {
  date: Date;
  entries: CalendarEvent[];
  timezone: string;
}

/** useDayEntries フックの戻り値 */
export interface UseDayEntriesReturn {
  dayEntries: CalendarEvent[];
  entryPositions: EntryPosition[];
  maxConcurrentEntries: number;
}

/** エントリの計算済み位置情報 */
export interface EntryPosition {
  plan: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
  column: number;
  totalColumns: number;
}
