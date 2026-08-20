import type { CSSProperties } from 'react';

import type { GridViewProps } from './base.types';
import type { CalendarDisplayEvent } from './calendar.types';
import type { TimeSlot } from './grid.types';

/** DayViewの固有Props（GridViewPropsを継承して時間グリッド機能を使用） */
export type DayViewProps = GridViewProps;

/** useDayView フックのオプション */
export interface UseDayViewOptions {
  date: Date;
  entries: CalendarDisplayEvent[];
  onEntryUpdate?: (entry: CalendarDisplayEvent) => void;
  timezone: string;
}

/** useDayView フックの戻り値 */
export interface UseDayViewReturn {
  dayEntries: CalendarDisplayEvent[];
  timeblockStyles: Record<string, CSSProperties>;
  isToday: boolean;
  timeSlots: TimeSlot[];
}

/** useDayEntries フックのオプション */
export interface UseDayEntriesOptions {
  date: Date;
  entries: CalendarDisplayEvent[];
  timezone: string;
}

/** useDayEntries フックの戻り値 */
export interface UseDayEntriesReturn {
  dayEntries: CalendarDisplayEvent[];
  timeblockPositions: TimeblockPosition[];
  maxConcurrentEntries: number;
}

/** エントリの計算済み位置情報 */
export interface TimeblockPosition {
  plan: CalendarDisplayEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  zIndex: number;
  column: number;
  totalColumns: number;
}
