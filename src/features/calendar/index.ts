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
export type { CalendarControllerProps } from './components/CalendarController';

// =============================================================================
// Layout Components
// =============================================================================
export { CalendarLayout } from './components/layout/CalendarLayout';
export { DateRangeDisplay } from './components/layout/Header/DateRangeDisplay';
export { ViewSwitcher } from './components/layout/Header/ViewSwitcher';
export { ViewSwitcherList } from './components/layout/Header/ViewSwitcherList';

// =============================================================================
// View Components
// =============================================================================
export { DayView } from './components/views/DayView';
export { MultiDayView } from './components/views/MultiDayView';
export { WeekView } from './components/views/WeekView';

// =============================================================================
// Filter
// =============================================================================
export { CalendarFilterList } from './components/tag-filter/CalendarFilterList';

// =============================================================================
// Types
// =============================================================================
export { getMultiDayCount, isMultiDayView } from './types/calendar.types';
export type {
  CalendarEvent,
  CalendarFilter,
  CalendarViewProps,
  CalendarViewState,
  CalendarViewType,
  CreatePlanInput,
  MultiDayCount,
  MultiDayViewType,
  PlanInstance,
  RecurrencePattern,
  UpdatePlanInput,
  ViewDateRange,
  ViewSelectorProps,
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
export { useCalendarProviderProps } from './hooks/navigation/useCalendarProviderProps';
export { useWeekendNavigation } from './hooks/navigation/useWeekendNavigation';
export { useCalendarLayout } from './hooks/ui/useCalendarLayout';

// Stores: Cross-feature (used by composition layer in app/)
export { useInlineCreateStore } from './stores/useInlineCreateStore';

// Hooks: Cross-feature (used by composition layer in app/)
export { useCalendarData } from './components/controller/hooks/useCalendarData';
export { useCalendarHandlers } from './components/controller/hooks/useCalendarHandlers';
export { useCalendarNavigationHandlers } from './components/controller/hooks/useCalendarNavigationHandlers';
export { useCalendarEventKeyboard } from './hooks/keyboard/useCalendarPlanKeyboard';
export { useWeekendToggleShortcut } from './hooks/keyboard/useWeekendToggleShortcut';
export { usePlanContextActions } from './hooks/operations/usePlanContextActions';
export { usePlanOperations } from './hooks/operations/usePlanOperations';
export { useRecurringPlanDrag } from './hooks/operations/useRecurringPlanDrag';

// =============================================================================
// Lib / Utils
// =============================================================================
export { getEventOrigin, isRecordEvent } from './lib/plan-data-adapter';
export { calculateViewDateRange, getNextPeriod, getPreviousPeriod } from './lib/range';
export { isCalendarViewPath } from './lib/route-utils';

// =============================================================================
// Grid Constants (used by settings feature)
// =============================================================================
export {
  HOUR_HEIGHT,
  HOUR_HEIGHT_DENSITIES,
} from './components/views/shared/constants/grid.constants';
export type { HourHeightDensity } from './components/views/shared/constants/grid.constants';
