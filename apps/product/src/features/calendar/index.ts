/**
 * Calendar Feature - Public API
 *
 * この barrel export は外部から参照される公開インターフェースを定義する。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 */

// =============================================================================
// Main Controller
// =============================================================================
export { CalendarController } from './components/CalendarController';

// =============================================================================
// Layout Components
// =============================================================================
export { CalendarAnalyticsPanel } from './components/analytics/CalendarAnalyticsPanel';
export { CalendarCompareToggle } from './components/layout/Header/CalendarCompareToggle';
export { ViewSwitcherList } from './components/layout/Header/ViewSwitcherList';

// =============================================================================
// Filter
// =============================================================================
export { CalendarFilterList } from './components/tag-filter/CalendarFilterList';
export { TagChipRow } from './components/tag-filter/components/TagChipRow';

// =============================================================================
// Types
// =============================================================================
export type {
  CalendarEvent,
  CalendarViewType,
  MultiDayViewType,
  ViewDateRange,
} from './types/calendar.types';

// =============================================================================
// Contexts
// =============================================================================
export {
  CalendarNavigationProvider,
  useCalendarNavigation,
} from './hooks/navigation/CalendarNavigationContext';

// =============================================================================
// State / settings（app composition 層からのbarrel import用）
// =============================================================================
// Note: useInlineCreateStore / useCalendarFilterStore は barrel 公開せず deep import で参照する。
// useUserPreferences は app-wide なserver stateのため @/lib/hooks/ 配下に置く。
export { useCalendarSettings } from './hooks/useCalendarSettings';
export { useCalendarNavigationStore } from './stores/useCalendarNavigationStore';
export type { UserSettings } from './stores/userSettings';
// =============================================================================
// Hooks
// =============================================================================

// Hooks: Cross-feature (used by composition layer in app/)
export { useCalendarData } from './components/controller/hooks/useCalendarData';
export { useCalendarHandlers } from './components/controller/hooks/useCalendarHandlers';
export { useCalendarNavigationHandlers } from './components/controller/hooks/useCalendarNavigationHandlers';
export { useCalendarEventKeyboard } from './hooks/keyboard/useCalendarEntryKeyboard';
export { useWeekendToggleShortcut } from './hooks/keyboard/useWeekendToggleShortcut';
export { useEntryContextActions } from './hooks/operations/useEntryContextActions';
export { useEntryOperations } from './hooks/operations/useEntryOperations';

// =============================================================================
// Domain（Calendar 固有の仕様ルール）
// =============================================================================
export { calculateViewDateRange } from './domain/view-range';

// =============================================================================
// Lib / Utils
// =============================================================================
export { formatCalendarDateParam, parseCalendarDateParam } from './lib/date-param';
export { isCalendarViewPath } from './lib/route-utils';

// ここにないものはfeature内部専用
