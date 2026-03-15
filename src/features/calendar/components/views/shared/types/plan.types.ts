/**
 * プラン関連の型定義
 *
 * PlanCardProps/PlanCardPosition は EntryCard (@/features/entry) に移動。
 * 後方互換のため re-export を維持。
 */

import type { CalendarEvent } from '../../../../types/calendar.types';

import type { EntryCardPosition, EntryCardProps } from '@/features/entry';

// 時間指定プラン（start/endを持つプラン）
// CalendarEventの startDate/endDate を start/end に変換した型
export type TimedPlan = CalendarEvent & {
  start: Date; // startDateのエイリアス
  end: Date; // endDateのエイリアス
  isReadOnly?: boolean;
};

/** @deprecated EntryCardProps を使用してください */
export type PlanCardProps = EntryCardProps;

/** @deprecated EntryCardPosition を使用してください */
export type PlanCardPosition = EntryCardPosition;

export interface PlanGroup {
  plans: CalendarEvent[];
  columns: PlanColumn[];
}

export interface PlanColumn {
  plans: CalendarEvent[];
  columnIndex: number;
  totalColumns: number;
}

export type PlanInteractionHandler = {
  onClick?: (plan: CalendarEvent) => void;
  onContextMenu?: (plan: CalendarEvent, e: React.MouseEvent) => void;
  onDragStart?: (plan: CalendarEvent) => void;
  onDragEnd?: (plan: CalendarEvent) => void;
  onDragOver?: (plan: CalendarEvent, date: Date, time: Date) => void;
  onDrop?: (plan: CalendarEvent, date: Date, time: Date) => void;
  onResize?: (plan: CalendarEvent, newStart: Date, newEnd: Date) => void;
};
