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
// Hooks
// =============================================================================

// Note: useInlineCreateStore は calendar hub 内部のみで使用。barrel 公開せず
// deep import (`./stores/useInlineCreateStore`) で参照する。
// useCalendarSettingsStore / useCalendarNavigationStore / useCalendarFilterStore /
// 型 CalendarSettings, DateFormatType は cross-cutting UI state として @/lib/stores/ に移動済み。
// 直接 `@/lib/stores/useCalendar...Store` から import すること。

// Hooks: Cross-feature (used by composition layer in app/)
export { useCalendarData } from './components/controller/hooks/useCalendarData';
export { useCalendarHandlers } from './components/controller/hooks/useCalendarHandlers';
export { useCalendarNavigationHandlers } from './components/controller/hooks/useCalendarNavigationHandlers';
export { useCalendarEventKeyboard } from './hooks/keyboard/useCalendarEntryKeyboard';
export { useWeekendToggleShortcut } from './hooks/keyboard/useWeekendToggleShortcut';
export { useEntryContextActions } from './hooks/operations/useEntryContextActions';
export { useEntryOperations } from './hooks/operations/useEntryOperations';

// =============================================================================
// Lib / Utils
// =============================================================================
export { formatCalendarDateParam, parseCalendarDateParam } from './lib/date-param';
export { calculateViewDateRange } from './lib/range';
export { isCalendarViewPath } from './lib/route-utils';

// ここにないものはfeature内部専用
