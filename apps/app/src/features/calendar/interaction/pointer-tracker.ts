/**
 * Pointer Tracker — mouse/touch イベントの正規化
 *
 * React/DOM依存は最小限（イベント型のみ）。
 * すべての計算は純粋関数。
 */

import type { Point } from './types';

// ========================================
// Duck-typed event interfaces
// ========================================

interface TouchLike {
  clientX: number;
  clientY: number;
}

interface TouchEventLike {
  touches: ArrayLike<TouchLike>;
  changedTouches?: ArrayLike<TouchLike>;
}

interface MouseEventLike {
  clientX: number;
  clientY: number;
}

// ========================================
// Exports
// ========================================

/**
 * Extract a normalized Point from a mouse or touch event.
 *
 * For touch events, uses the first active touch.
 * Falls back to changedTouches (for touchend where touches is empty).
 */
export function getPointerPoint(e: MouseEventLike | TouchEventLike): Point {
  if ('touches' in e) {
    const touch = e.touches[0] ?? (e.changedTouches as ArrayLike<TouchLike> | undefined)?.[0];
    if (!touch) return { clientX: 0, clientY: 0 };
    return { clientX: touch.clientX, clientY: touch.clientY };
  }
  return { clientX: e.clientX, clientY: e.clientY };
}

/**
 * Constrain a point within a bounding rect.
 *
 * Usage: pass `container.getBoundingClientRect()` as `bounds`.
 */
export function constrainToRect(
  point: Point,
  bounds: { left: number; right: number; top: number; bottom: number },
): Point {
  return {
    clientX: Math.max(bounds.left, Math.min(bounds.right, point.clientX)),
    clientY: Math.max(bounds.top, Math.min(bounds.bottom, point.clientY)),
  };
}

/**
 * Convert a viewport-relative clientY to a grid-relative Y position.
 *
 * @param clientY  — viewport Y coordinate
 * @param gridTop  — grid container's top offset (from getBoundingClientRect().top)
 * @param scrollTop — grid container's scrollTop
 */
export function clientYToGridY(clientY: number, gridTop: number, scrollTop: number): number {
  return clientY - gridTop + scrollTop;
}

/**
 * Determine if an event is a touch event.
 */
export function isTouchEvent(e: MouseEventLike | TouchEventLike): e is TouchEventLike {
  return 'touches' in e;
}
