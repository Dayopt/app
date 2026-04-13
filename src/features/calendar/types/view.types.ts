/**
 * ビュー関連の型定義
 */

import type { CalendarEvent, CalendarViewType } from './calendar.types';
import type { EntryInteractionHandler } from './entry.types';

/** @deprecated CalendarViewType を使用してください */
export type ViewType = CalendarViewType;

/** ビューコンポーネントの基本プロパティ */
export interface ViewProps {
  dates: Date[];
  events: CalendarEvent[];
  currentDate: Date;
  viewType: ViewType;
  className?: string;
}

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

/** 空状態コンポーネントのプロパティ */
export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>> | React.ReactNode;
  actions?: React.ReactNode;
  hint?: string;
  className?: string;
}

/** ビューナビゲーションコンポーネントのプロパティ */
export interface ViewNavigationProps {
  currentDate: Date;
  viewType: ViewType;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onViewChange: (viewType: ViewType) => void;
  onDateSelect: (date: Date) => void;
  className?: string;
}

/** ビューの表示設定 */
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

/** ビューコンテキストの値（設定＋インタラクションハンドラー＋データ） */
export interface ViewContextValue extends ViewConfiguration, EntryInteractionHandler {
  dates: Date[];
  events: CalendarEvent[];
  currentDate: Date;
  viewType: ViewType;
}
