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
// Contexts
// =============================================================================
export { useCalendarEntryActions } from './contexts/CalendarEntryActionsContext';
export type { CalendarEntryActions } from './contexts/CalendarEntryActionsContext';

// =============================================================================
// Hooks
// =============================================================================
export { useCalendarSidebarLayout } from './hooks/ui/useCalendarSidebarLayout';

// Stores: Cross-feature (used by composition layer in app/)
export { useInlineCreateStore } from './stores/useInlineCreateStore';

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

// =============================================================================
// Grid Constants (used by settings feature)
// =============================================================================
export {
  HOUR_HEIGHT,
  HOUR_HEIGHT_DENSITIES,
} from './components/views/shared/constants/grid.constants';
export type { HourHeightDensity } from './components/views/shared/constants/grid.constants';
