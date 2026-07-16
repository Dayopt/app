/**
 * Interaction State Machine — グリッド幾何計算
 *
 * ピクセル ⇔ 時刻のスナップ、選択範囲・ドラッグ範囲の構築。
 * React/DOM 依存ゼロの純粋関数のみ。
 */

import { snapToGrid } from './time-math';
import type { InteractionContext, Point, TimeRange } from './types';

/**
 * snappedTop を当日範囲内 [0, 24h - durationPx] に clamp する。
 * pixelsToTimeUnsnapped が時刻を 23:59 でクランプするため、ピクセルも合わせないと
 * ghost が画面外へずれる（Codex P2 指摘）。
 */
export function clampSnappedTopToDay(
  snappedTop: number,
  hourHeight: number,
  durationPx = 0,
): number {
  const dayMaxPx = 24 * hourHeight - durationPx;
  return Math.max(0, Math.min(snappedTop, Math.max(0, dayMaxPx)));
}

export function maxAbsDelta(a: Point, b: Point): number {
  return Math.max(Math.abs(a.clientX - b.clientX), Math.abs(a.clientY - b.clientY));
}

export type GridSnap = ReturnType<typeof snapToGrid>;

export function snapEndToGrid(yPx: number, hourHeight: number, intervalMin: number): GridSnap {
  const pxPerInterval = (hourHeight / 60) * intervalMin;
  if (pxPerInterval <= 0) return snapToGrid(yPx, hourHeight, intervalMin);

  const dayHeight = 24 * hourHeight;
  const clampedY = Math.max(0, Math.min(yPx, dayHeight));
  const snappedTop = Math.max(
    0,
    Math.min(dayHeight, Math.round(clampedY / pxPerInterval) * pxPerInterval),
  );
  const totalMinutes = Math.min(24 * 60, Math.round((snappedTop / hourHeight) * 60));

  return {
    snappedTop,
    hour: Math.floor(totalMinutes / 60),
    minute: totalMinutes % 60,
  };
}

export function ensureEndAfterStartSnap(
  startSnap: GridSnap,
  endSnap: GridSnap,
  hourHeight: number,
  intervalMin: number,
): GridSnap {
  if (endSnap.snappedTop > startSnap.snappedTop) return endSnap;

  const minEndTop = Math.min(
    24 * hourHeight,
    startSnap.snappedTop + (hourHeight / 60) * intervalMin,
  );
  return snapEndToGrid(minEndTop, hourHeight, intervalMin);
}

/** Dragging snaps both boundaries so drop time and visual length stay on the active grid. */
export function buildDragTimeRange(
  targetDate: Date,
  startSnap: GridSnap,
  endSnap: GridSnap,
  intervalMin: number,
): TimeRange {
  const start = new Date(targetDate);
  start.setHours(startSnap.hour, startSnap.minute, 0, 0);
  const end = new Date(targetDate);
  end.setHours(endSnap.hour, endSnap.minute, 0, 0);

  if (end.getTime() <= start.getTime()) {
    end.setTime(start.getTime() + intervalMin * 60_000);
  }

  return { start, end };
}

/** Resolve the target date for a given date index */
export function resolveTargetDate(ctx: InteractionContext, targetDateIndex: number): Date {
  if (ctx.viewMode !== 'day' && ctx.displayDates?.[targetDateIndex]) {
    return ctx.displayDates[targetDateIndex];
  }
  return ctx.date;
}

/** Build a time range for a grid selection (downward only from startY) */
export function buildSelectionRange(
  startY: number,
  endY: number,
  hourHeight: number,
  targetDate: Date,
  intervalMin: number,
): TimeRange {
  const startSnap = snapToGrid(startY, hourHeight, intervalMin);
  // 下方向のみ: endY が startY より上なら startY に固定
  const clampedEndY = Math.max(endY, startY);
  let endSnap = snapEndToGrid(clampedEndY, hourHeight, intervalMin);
  endSnap = ensureEndAfterStartSnap(startSnap, endSnap, hourHeight, intervalMin);

  const start = new Date(targetDate);
  start.setHours(startSnap.hour, startSnap.minute, 0, 0);
  const end = new Date(targetDate);
  end.setHours(endSnap.hour, endSnap.minute, 0, 0);

  return { start, end };
}
