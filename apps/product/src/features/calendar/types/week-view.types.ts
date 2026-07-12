import type { BaseEntryPosition, GridViewProps } from './base.types';
import type { CalendarEvent } from './calendar.types';

import type { DateTimeSelection } from '../components/views/shared';

/** WeekView の固有Props（GridViewPropsを継承して時間グリッド機能を使用） */
export interface WeekViewProps extends GridViewProps {
  weekStartsOn?: 0 | 1 | 6; // 0: 日曜始まり, 1: 月曜始まり, 6: 土曜始まり
}

/** WeekGrid コンポーネントのプロパティ */
export interface WeekGridProps {
  weekDates: Date[];
  events: CalendarEvent[];
  /** 全エントリ（期限切れ未完了表示用） */
  allTimeblocks?: CalendarEvent[] | undefined;
  eventsByDate: Record<string, CalendarEvent[]>;
  todayIndex: number;
  /** DnDを無効化するTimeblock ID（Inspector表示中のTimeblock など） */
  disabledTimeblockId?: string | null | undefined;
  onEventClick?: ((entry: CalendarEvent) => void) | undefined;
  onEventContextMenu?: ((entry: CalendarEvent, mouseEvent: React.MouseEvent) => void) | undefined;
  onEventUpdate?:
    | ((
        timeblockIdOrTimeblock: string | CalendarEvent,
        updates?: {
          startTime: Date;
          endTime: Date;
          resetActualTime?: boolean;
        },
      ) => void | Promise<void> | Promise<{ skipToast: true } | void>)
    | undefined;
  onTimeRangeSelect?: ((selection: DateTimeSelection) => void) | undefined;
  /** compare の差分 marker を表示する */
  showActualDiff?: boolean | undefined;
  /** compare Rail に出ている entry の ID 一覧 */
  dayDiffEntryIds?: ReadonlySet<string> | undefined;
  className?: string | undefined;
}

/** useWeekView フックのオプション */
export interface UseWeekViewOptions {
  startDate: Date;
  events: CalendarEvent[];
  timezone: string;
  weekStartsOn?: 0 | 1 | 6;
  onEventUpdate?: (
    timeblockIdOrTimeblock: string | CalendarEvent,
    updates?: {
      startTime: Date;
      endTime: Date;
      resetActualTime?: boolean;
    },
  ) => void | Promise<void> | Promise<{ skipToast: true } | void>;
}

/** useWeekView フックの戻り値 */
export interface UseWeekViewReturn {
  weekDates: Date[];
  eventsByDate: Record<string, CalendarEvent[]>;
  todayIndex: number;
  scrollToNow: () => void;
  isCurrentWeek: boolean;
}

/** useWeekTimeblocks フックのオプション */
export interface UseWeekEntriesOptions {
  weekDates: Date[];
  events: CalendarEvent[];
  hourHeight?: number;
  timezone: string;
}

/** useWeekTimeblocks フックの戻り値 */
export interface UseWeekEntriesReturn {
  entriesByDate: Record<string, CalendarEvent[]>;
  timeblockPositions: WeekEntryPosition[];
  maxConcurrentEntries: number;
}

/** 週ビューでのエントリ位置情報（BaseEntryPosition に dayIndex を追加） */
export interface WeekEntryPosition extends BaseEntryPosition {
  dayIndex: number;
}
