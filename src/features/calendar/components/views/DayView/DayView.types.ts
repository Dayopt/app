import type { CSSProperties } from 'react';

import type { CalendarEvent } from '../../../types/calendar.types';

import type { DateTimeSelection, GridViewProps, TimeSlot } from '../shared';

/** DayViewの固有Props（GridViewPropsを継承して時間グリッド機能を使用） */
export type DayViewProps = GridViewProps;

/** シンプル版のDayViewProps（後方互換性のため） */
export interface SimpleDayViewProps {
  date: Date;
  entries?: CalendarEvent[];
  className?: string;
  onEntryClick?: (entry: CalendarEvent) => void;
  onEntryUpdate?: (entry: CalendarEvent) => void;
  onEntryCreate?: (date: Date, time: string) => void;
  onEntryDelete?: (entryId: string) => void;
}

/** DayContent コンポーネントのプロパティ */
export interface DayContentProps {
  date: Date;
  entries?: CalendarEvent[] | undefined;
  events?: CalendarEvent[] | undefined; // eventsはentriesのエイリアス（後方互換性のため）
  entryStyles?: Record<string, CSSProperties> | undefined;
  eventStyles?: Record<string, CSSProperties> | undefined; // eventStylesはentryStylesのエイリアス（後方互換性のため）
  onEntryClick?: ((entry: CalendarEvent) => void) | undefined;
  onEntryContextMenu?: ((entry: CalendarEvent, mouseEvent: React.MouseEvent) => void) | undefined;
  onEntryUpdate?: ((entry: CalendarEvent) => void) | undefined;
  onEventUpdate?:
    | ((
        eventId: string,
        updates: { startTime: Date; endTime: Date; resetActualTime?: boolean },
      ) => Promise<void | { skipToast: true }>)
    | undefined; // D&D用
  onTimeRangeSelect?: ((selection: DateTimeSelection) => void) | undefined;
  className?: string | undefined;
  /** DnDを無効化するエントリID（Inspector表示中のエントリなど） */
  disabledEntryId?: string | null | undefined;
}

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

/** DayView の表示設定 */
export interface DayViewSettings {
  startHour: number;
  endHour: number;
  timeInterval: 15 | 30 | 60; // minutes
  showQuarterLines: boolean;
  showCurrentTime: boolean;
  maxEntryColumns: number;
  entryMinHeight: number;
}
