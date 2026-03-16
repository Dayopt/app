/**
 * 共有カレンダーコンポーネントのメインエクスポート
 */

// ===== グリッドシステム =====
// TimeColumn - 時間列
export { TimeColumn, TimeLabel } from './grid/TimeColumn';

// GridLines - グリッド線
export { HalfHourLines, HourLines } from './grid/GridLines';

// CurrentTimeLine - 現在時刻線
export { CurrentTimeLine, CurrentTimeLineForColumn } from './grid/CurrentTimeLine';

// ===== UIコンポーネント =====
// EntryCard - エントリ表示（@/features/entry から re-export）
export { EntryCard } from '@/features/entry';
export type { EntryCardPosition, EntryCardProps } from '@/features/entry';

// DayColumn - 日列（イベント表示エリアのみ）
export { DayColumn } from './components/DayColumn';

// ドラッグ選択レイヤー（新設計）
export { CalendarDragSelection } from './components/CalendarDragSelection';
export type { DateTimeSelection, TimeRange } from './components/CalendarDragSelection';

// TimezoneOffset - タイムゾーン表示
export { TimezoneOffset } from './components/TimezoneOffset';

// DateDisplay - 日付表示
export type * from './DateDisplay';
export { DateDisplay, DateDisplayRow, DayDisplay } from './DateDisplay';

// ===== カスタムフック =====
export { useCurrentTime } from './hooks/useCurrentTime';
export { useIsToday } from './hooks/useIsToday';
export { usePlanLayoutCalculator } from './hooks/usePlanLayoutCalculator';
export type { PlanLayout } from './hooks/usePlanLayoutCalculator';
export { usePlanPosition, usePositionedPlans } from './hooks/usePlanPosition';
export { usePlanStyles } from './hooks/usePlanStyles';
export { useResponsiveHourHeight } from './hooks/useResponsiveHourHeight';
export { useTimeGrid } from './hooks/useTimeGrid';
export { useTimeSlots } from './hooks/useTimeSlots';
export { useViewPlans } from './hooks/useViewPlans';
export type { PlanPosition } from './hooks/useViewPlans';

// Phase 3: 統合カスタムフック
export { useCurrentPeriod } from './hooks/useCurrentPeriod';
export type { UseCurrentPeriodOptions, UseCurrentPeriodReturn } from './hooks/useCurrentPeriod';
export { useDateUtilities } from './hooks/useDateUtilities';
export type { UseDateUtilitiesOptions, UseDateUtilitiesReturn } from './hooks/useDateUtilities';
export { useMultiDayPlanPositions } from './hooks/useMultiDayPlanPositions';
export { usePlansByDate } from './hooks/usePlansByDate';
export type { UsePlansByDateOptions, UsePlansByDateReturn } from './hooks/usePlansByDate';

// ScrollableCalendarLayout関連フック
export { useCurrentTimeLine } from './hooks/useCurrentTimeLine';
export { useScrollableCalendar } from './hooks/useScrollableCalendar';
export { useSleepHoursLayout } from './hooks/useSleepHoursLayout';

// ===== プロバイダー =====
export { CalendarGridProvider, useCalendarGridVars } from './components/CalendarGridProvider';

// ===== レイアウト =====
export {
  CalendarDateHeader,
  ScrollableCalendarLayout,
} from './components/ScrollableCalendarLayout';

// 型定義のエクスポート
export type { PositionedPlan } from './hooks/usePlanPosition';

// ===== ユーティリティ関数 =====
// @/lib/date re-exports（使用中のもののみ）
export { getDateKey } from '@/lib/date';

// dateHelpers（カレンダー固有）
export { formatDate, getTodayIndex, isValidEvent } from './utils/dateHelpers';

// planSorting（使用中のもののみ）
export { sortEventsByDateKeys } from './utils/planSorting';

// ===== 定数 =====
export {
  CURRENT_TIME_DOT_SIZE,
  CURRENT_TIME_LINE_COLOR,
  EVENT_GAP,
  EVENT_HORIZONTAL_PADDING,
  EVENT_VERTICAL_PADDING,
  GRID_BACKGROUND,
  GRID_BORDER,
  HALF_HOUR_HEIGHT,
  HALF_HOUR_LINE_COLOR,
  HOUR_HEIGHT,
  HOUR_LINE_COLOR,
  MINUTE_HEIGHT,
  MIN_EVENT_HEIGHT,
  SCROLL_BEHAVIOR,
  SCROLL_TO_HOUR,
  TIME_COLUMN_WIDTH,
  TIME_LABEL_HEIGHT,
  TRANSITION_DURATION,
  Z_INDEX,
} from './constants/grid.constants';

// ===== 型定義 =====
export type * from './types/base.types';
export type * from './types/grid.types';
export type { TimeSlot } from './types/grid.types';
export type * from './types/plan.types';
export type * from './types/view.types';
