/**
 * 時刻 ↔ ピクセル変換の唯一のソース
 *
 * React/DOM 依存ゼロ。DnDProvider / machine.ts / useDragSelection が共通利用。
 * snap interval policy は `../precision` の `DEFAULT_DRAG_SNAP_MINUTES` を canonical source とする。
 * テスト: __tests__/time-math.test.ts
 */

import { DEFAULT_DRAG_SNAP_MINUTES } from '../precision';

/** Y座標 → 時刻（スナップあり） */
export function pixelsToTime(
  yPx: number,
  hourHeight: number,
  snapInterval: number = DEFAULT_DRAG_SNAP_MINUTES,
): { hour: number; minute: number } {
  const clampedY = Math.max(0, yPx);
  const hourDecimal = clampedY / hourHeight;
  let hour = Math.floor(Math.min(23, hourDecimal));
  const minuteFraction = (hourDecimal - hour) * 60;
  let minute = Math.round(minuteFraction / snapInterval) * snapInterval;

  if (minute >= 60) {
    minute = 0;
    hour = Math.min(23, hour + 1);
  }

  return { hour, minute };
}

/** 時刻 → Y座標 */
export function timeToPixels(hour: number, minute: number, hourHeight: number): number {
  return (hour + minute / 60) * hourHeight;
}

/** pixelsToTime + timeToPixels を一度にやる（interaction machine 用） */
export function snapToGrid(
  yPx: number,
  hourHeight: number,
  intervalMin: number = DEFAULT_DRAG_SNAP_MINUTES,
): { snappedTop: number; hour: number; minute: number } {
  const { hour, minute } = pixelsToTime(yPx, hourHeight, intervalMin);
  const snappedTop = timeToPixels(hour, minute, hourHeight);
  return { snappedTop, hour, minute };
}

/** 時刻 + duration → 終了時刻 */
export function addMinutesToTime(
  hour: number,
  minute: number,
  durationMinutes: number,
): { hour: number; minute: number } {
  const totalMinutes = hour * 60 + minute + durationMinutes;
  const endHour = Math.floor(totalMinutes / 60) % 24;
  const endMinute = totalMinutes % 60;
  return { hour: endHour, minute: endMinute };
}

/**
 * Y 座標 → 時刻（snap せず、float 誤差だけ吸収）
 *
 * relative offset snap で「originalPosition.top をそのまま時刻に戻す」
 * 用途。ここで snap してしまうと 10:07 のような非グリッド時刻を保持できない。
 *
 * @see apps/storybook/docs/product/projects/timeline-precision-redesign/overview.mdx § 4 A-2
 */
export function pixelsToTimeUnsnapped(
  yPx: number,
  hourHeight: number,
): { hour: number; minute: number } {
  const clampedY = Math.max(0, yPx);
  const totalMinutes = Math.round((clampedY / hourHeight) * 60);
  const dayMaxMinutes = 23 * 60 + 59;
  const clamped = Math.min(dayMaxMinutes, totalMinutes);
  return {
    hour: Math.floor(clamped / 60),
    minute: clamped % 60,
  };
}

/**
 * deltaY のみを snap する（絶対位置は snap しない）
 *
 * relative offset snap の核となる関数。drag 開始時の `originalPosition.top` を
 * source of truth として保ち、移動量 (deltaY) だけを snap interval で量子化する。
 * これにより 10:07 entry を 30 分動かすと 10:37 になる（10:00 / 10:15 に潰れない）。
 *
 * @see apps/storybook/docs/product/projects/timeline-precision-redesign/overview.mdx § 4 A-2 / D-7
 */
export function snapDeltaToGrid(
  deltaPx: number,
  hourHeight: number,
  intervalMin: number = DEFAULT_DRAG_SNAP_MINUTES,
): number {
  const pxPerInterval = (hourHeight / 60) * intervalMin;
  if (pxPerInterval <= 0) return 0;
  return Math.round(deltaPx / pxPerInterval) * pxPerInterval;
}
