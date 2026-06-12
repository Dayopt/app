/**
 * ビュー関連の型定義
 */

import type { CalendarEvent } from './calendar.types';

/** 日付列コンポーネントのプロパティ */
export interface DayColumnProps {
  date: Date;
  events: CalendarEvent[];
  hourHeight?: number | undefined;
  isToday?: boolean | undefined;
  isWeekend?: boolean | undefined;
  onTimeClick?: ((date: Date, hour: number, minute: number) => void) | undefined;
  onEventClick?: ((plan: CalendarEvent) => void) | undefined;
  onEventContextMenu?: ((plan: CalendarEvent, e: React.MouseEvent) => void) | undefined;
  className?: string | undefined;
}
