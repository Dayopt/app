/**
 * ビュー関連の型定義
 */

import type { CalendarEvent, CalendarViewType } from '../../../../types/calendar.types';
import type { PlanInteractionHandler } from './plan.types';

/** @deprecated CalendarViewType を使用してください */
export type ViewType = CalendarViewType;

export interface ViewProps {
  dates: Date[];
  events: CalendarEvent[];
  currentDate: Date;
  viewType: ViewType;
  className?: string;
}

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

export interface DayDisplayProps {
  date: Date;
  isToday?: boolean;
  isWeekend?: boolean;
  isSelected?: boolean;
  format?: 'short' | 'long' | 'numeric';
  onClick?: (date: Date) => void;
  className?: string;
}

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>> | React.ReactNode;
  actions?: React.ReactNode;
  hint?: string;
  className?: string;
}

export interface ViewNavigationProps {
  currentDate: Date;
  viewType: ViewType;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onViewChange: (viewType: ViewType) => void;
  onDateSelect: (date: Date) => void;
  className?: string;
}

export interface ViewConfiguration {
  hourHeight: number;
  timeColumnWidth: number;
  showTimeColumn: boolean;
  showAllDaySection: boolean;
  showWeekends: boolean;
  showCurrentTime: boolean;
  startHour: number;
  endHour: number;
  scrollToHour: number;
}

export interface ViewContextValue extends ViewConfiguration, PlanInteractionHandler {
  dates: Date[];
  events: CalendarEvent[];
  currentDate: Date;
  viewType: ViewType;
}
