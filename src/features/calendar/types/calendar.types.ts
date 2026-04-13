// CalendarEvent は共有層（@/types）が canonical source
// feature 間で共有するため features/ 内には定義しない
export type { CalendarEvent } from '@/lib/types/calendar-event';

// CalendarViewType 関連は共有層（@/lib/calendar-constants）が canonical source
// store も参照するため feature 内には置けない
export { getMultiDayCount, isMultiDayView } from '@/lib/calendar-constants';
export type { CalendarViewType, MultiDayCount, MultiDayViewType } from '@/lib/calendar-constants';

/** ビューの日付範囲（開始・終了・各日の配列） */
export interface ViewDateRange {
  start: Date;
  end: Date;
  days: Date[];
}

/** カレンダーのフィルター条件 */
export interface CalendarFilter {
  calendarIds?: string[];
  startDate: Date;
  endDate: Date;
  status?: string[];
  priority?: string[];
  tags?: string[];
  includeAllDay?: boolean;
}
