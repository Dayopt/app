// CalendarEvent は features/timeblock/types/calendar-event.ts が canonical source
// (Timeblock の表示射影型のため owner は entry)
export type { CalendarEvent } from '@/features/timeblock';

// CalendarViewType 関連は feature 内の lib/constants が canonical source
export { getMultiDayCount, isMultiDayView } from '../lib/constants';
export type { CalendarViewType, MultiDayViewType } from '../lib/constants';

/** ビューの日付範囲（開始・終了・各日の配列） */
export interface ViewDateRange {
  start: Date;
  end: Date;
  days: Date[];
}
