import type { CalendarViewType } from '@/lib/calendar-constants';

// CalendarEvent は共有層（@/types）が canonical source
// feature 間で共有するため features/ 内には定義しない
export type { CalendarEvent } from '@/types/calendar-event';

// CalendarViewType 関連は共有層（@/lib/calendar-constants）が canonical source
// store も参照するため feature 内には置けない
export { getMultiDayCount, isMultiDayView } from '@/lib/calendar-constants';
export type { CalendarViewType, MultiDayCount, MultiDayViewType } from '@/lib/calendar-constants';

export interface CalendarViewProps {
  className?: string;
}

export interface ViewDateRange {
  start: Date;
  end: Date;
  days: Date[];
}

export interface ViewSelectorProps {
  value: CalendarViewType;
  onChange: (view: CalendarViewType) => void;
}

// ========================================
// 新しいDB設計に対応した型定義
// ========================================

// 繰り返しパターン
export interface RecurrencePattern {
  id: string;
  planId: string; // planId/eventId から変更
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  interval: number;
  weekdays?: number[]; // 0=日曜, 1=月曜, ..., 6=土曜
  monthlyType?: 'day_of_month' | 'day_of_week';
  dayOfMonth?: number;
  weekOfMonth?: number; // 1-5, 5=最終週
  endType: 'never' | 'after_occurrences' | 'on_date';
  occurrences?: number;
  endDate?: Date;
  excludedDates?: Date[];
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

// プランインスタンス（繰り返しプランの個別オカレンス）
export interface PlanInstance {
  id: string;
  planId: string; // planId/eventId から変更
  recurrencePatternId?: string;
  instanceStart: Date;
  instanceEnd: Date;
  exceptionType?: 'modified' | 'cancelled' | 'moved';
  title?: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * カレンダービュー状態
 * ユーザーごとのカレンダー表示設定を保持
 */
export interface CalendarViewState {
  id: string;
  userId: string;
  /** デフォルトで表示するビュータイプ */
  defaultView: CalendarViewType;
  /** 表示するカレンダーのID配列 */
  selectedCalendars: string[];
  /** タグフィルター（指定タグを持つプランのみ表示） */
  filterTags?: string[];
  /** 優先度フィルター */
  filterPriority?: string[];
  /** ステータスフィルター */
  filterStatus?: string[];
  /** 週末（土日）を表示するか */
  showWeekends: boolean;
  /** 週番号を表示するか */
  showWeekNumbers: boolean;
  /** 週の開始曜日（0=日曜, 1=月曜, ..., 6=土曜） */
  firstDayOfWeek: number;
  /** 時刻表示形式 */
  timeFormat: '12h' | '24h';
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePlanInput {
  title: string;
  description?: string;
  calendarId?: string;
  plannedStart?: Date;
  plannedEnd?: Date;
  status?: 'todo' | 'doing' | 'closed';
  priority?: 'urgent' | 'important' | 'necessary' | 'delegate' | 'optional';
  color?: string;
  location?: string;
  url?: string;
  reminderMinutes?: number;
  timezone?: string;
  visibility?: 'private' | 'public' | 'team';
  attendees?: Array<{
    email: string;
    name?: string;
  }>;
  tags?: string[];
  items?: Array<{
    text: string;
    completed?: boolean;
    duration?: number;
  }>;
  recurrence?: Omit<RecurrencePattern, 'id' | 'planId' | 'createdAt' | 'updatedAt'>;
}

export interface UpdatePlanInput extends Partial<CreatePlanInput> {
  id: string;
}

// フィルター条件
export interface CalendarFilter {
  calendarIds?: string[];
  startDate: Date;
  endDate: Date;
  status?: string[];
  priority?: string[];
  tags?: string[];
  includeRecurring?: boolean;
  includeAllDay?: boolean;
}
