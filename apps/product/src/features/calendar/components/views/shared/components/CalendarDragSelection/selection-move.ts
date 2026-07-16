/**
 * ドラッグ選択の移動計算
 *
 * mouse / touch の move ハンドラで共通の、Y 座標 → 選択範囲・ドラッグ判定・
 * スナップ変化・重複判定の算出。React/DOM 依存ゼロの純粋関数。
 */

import type {
  DateSelectionRange,
  HourMinute,
} from '../../../../../domain/interaction/selection-rules';
import {
  calculateSelection,
  createInstantSelection,
} from '../../../../../domain/interaction/selection-rules';
import { pixelsToTime } from '../../../../../domain/interaction/time-math';
import { checkClientSideOverlapByKind } from '../../../../../lib/overlap';
import type { CalendarEvent } from '../../../../../types/calendar.types';
import type { TimeRange } from './types';
import { DRAG_CONSTANTS } from './types';

export interface SelectionMoveInput {
  /** コンテナ相対の現在 Y 座標（px） */
  y: number;
  hourHeight: number;
  /** 選択開始時刻 */
  start: { hour: number; minute: number };
  /** 選択開始時の Y 座標（px） */
  startPixelY: number;
  /** これまでにドラッグ判定済みか */
  hasDragged: boolean;
  date: Date;
  plans: CalendarEvent[];
  /** 直前のスナップ位置（ハプティック発火判定用） */
  lastSnap: { startMin: number; endMin: number } | null;
}

interface SelectionMoveResult {
  selection: TimeRange;
  hasDragged: boolean;
  isOverlapping: boolean;
  snap: { startMin: number; endMin: number };
  /** スナップ位置が直前から変わったか（true ならハプティック） */
  snapChanged: boolean;
}

export function computeSelectionMove({
  y,
  hourHeight,
  start,
  startPixelY,
  hasDragged,
  date,
  plans,
  lastSnap,
}: SelectionMoveInput): SelectionMoveResult {
  const current = pixelsToTime(y, hourHeight);
  const selection = calculateSelection(start, current);

  const nextHasDragged = hasDragged || Math.abs(y - startPixelY) > DRAG_CONSTANTS.MIN_DRAG_DISTANCE;

  const startMin = selection.startHour * 60 + selection.startMinute;
  const endMin = selection.endHour * 60 + selection.endMinute;
  const snapChanged =
    lastSnap !== null && (startMin !== lastSnap.startMin || endMin !== lastSnap.endMin);

  const startTime = new Date(date);
  startTime.setHours(selection.startHour, selection.startMinute, 0, 0);
  const endTime = new Date(date);
  endTime.setHours(selection.endHour, selection.endMinute, 0, 0);
  const isOverlapping = checkClientSideOverlapByKind(plans, '', startTime, endTime);

  return {
    selection,
    hasDragged: nextHasDragged,
    isOverlapping,
    snap: { startMin, endMin },
    snapChanged,
  };
}

/**
 * 即時選択（double-click / タップ）の範囲と重複判定をまとめて解決する。
 * double-click と touch-end で共通のロジック。
 */
export function resolveInstantSelection(
  start: HourMinute,
  date: Date,
  defaultDuration: number,
  plans: CalendarEvent[],
): { selection: DateSelectionRange; isOverlapping: boolean } {
  const selection = createInstantSelection(start, date, defaultDuration);
  const startTime = new Date(date);
  startTime.setHours(selection.startHour, selection.startMinute, 0, 0);
  const endTime = new Date(date);
  endTime.setHours(selection.endHour, selection.endMinute, 0, 0);
  return {
    selection,
    isOverlapping: checkClientSideOverlapByKind(plans, '', startTime, endTime),
  };
}
