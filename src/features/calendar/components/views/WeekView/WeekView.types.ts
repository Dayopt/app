import type { CSSProperties } from 'react';

import type { BaseEntryPosition, CalendarEvent, DateTimeSelection, GridViewProps } from '../shared';

// WeekViewの固有Props（GridViewPropsを継承して時間グリッド機能を使用）
export interface WeekViewProps extends GridViewProps {
  weekStartsOn?: 0 | 1 | 6; // 0: 日曜始まり, 1: 月曜始まり, 6: 土曜始まり
}

// WeekGridコンポーネントのProps
export interface WeekGridProps {
  weekDates: Date[];
  events: CalendarEvent[];
  /** 全エントリ（期限切れ未完了表示用） */
  allEntries?: CalendarEvent[] | undefined;
  eventsByDate: Record<string, CalendarEvent[]>;
  todayIndex: number;
  /** DnDを無効化するエントリID（Inspector表示中のエントリなど） */
  disabledEntryId?: string | null | undefined;
  onEventClick?: ((entry: CalendarEvent) => void) | undefined;
  onEventContextMenu?: ((entry: CalendarEvent, mouseEvent: React.MouseEvent) => void) | undefined;
  onEventUpdate?: ((entry: CalendarEvent) => void) | undefined;
  onTimeRangeSelect?: ((selection: DateTimeSelection) => void) | undefined;
  className?: string | undefined;
}

// useWeekViewフックのオプション
export interface UseWeekViewOptions {
  startDate: Date;
  events: CalendarEvent[];
  weekStartsOn?: 0 | 1 | 6;
  onEventUpdate?: (entry: CalendarEvent) => void;
}

// useWeekViewフックの返却値
export interface UseWeekViewReturn {
  weekDates: Date[];
  eventsByDate: Record<string, CalendarEvent[]>;
  todayIndex: number;
  scrollToNow: () => void;
  isCurrentWeek: boolean;
}

// useWeekEntriesフックのオプション
export interface UseWeekEntriesOptions {
  weekDates: Date[];
  events: CalendarEvent[];
  hourHeight?: number;
  timezone: string;
}

// useWeekEntriesフックの返却値
export interface UseWeekEntriesReturn {
  entriesByDate: Record<string, CalendarEvent[]>;
  entryPositions: WeekEntryPosition[];
  maxConcurrentEntries: number;
}

// 週ビューでのエントリ位置情報
// WeekEntryPositionはBaseEntryPositionにdayIndexを追加
export interface WeekEntryPosition extends BaseEntryPosition {
  dayIndex: number;
}

// 時間スロット情報
export interface WeekTimeSlot {
  time: string;
  hour: number;
  minute: number;
  label: string;
  isHour: boolean;
  isHalfHour: boolean;
  isQuarterHour: boolean;
}

// 週ビューの設定
export interface WeekViewSettings {
  startHour: number;
  endHour: number;
  timeInterval: 15 | 30 | 60; // minutes
  showQuarterLines: boolean;
  showCurrentTime: boolean;
  maxEventColumns: number;
  eventMinHeight: number;
  dayColumnWidth: number; // 各日の列幅（%）
  showWeekends: boolean;
  weekStartsOn: 0 | 1 | 6;
}

// 日付ヘッダーの情報
export interface WeekDateDisplay {
  date: Date;
  dayName: string;
  dayNumber: number;
  isToday: boolean;
  isWeekend: boolean;
  events: CalendarEvent[];
  eventCount: number;
}

// イベントのスタイル情報
export interface WeekEventStyle {
  position: CSSProperties;
  color: string;
  textColor: string;
  borderColor: string;
  opacity: number;
}
