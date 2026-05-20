/**
 * Calendar Interaction Domain — sub barrel
 *
 * Calendar 上の空白選択 / drag / resize / pointer 計算の純粋ルール群。
 * React / DOM / Zustand / tRPC 非依存。React 接続層は `features/calendar/interaction/` の
 * `useInteraction` / `GhostRenderer` に分離されている。
 *
 * 過剰公開を避けるため `domain/index.ts` からは re-export しない。
 * 必要な consumer のみ `@/features/calendar/domain/interaction/...` で直接 import する。
 */

// ──────────────────────────────────────────────
// State machine（純粋レデューサー）
// ──────────────────────────────────────────────
export { IDLE, interactionReducer, snapToGrid } from './machine';

export type {
  EntryRect,
  InteractionAction,
  InteractionContext,
  InteractionEffect,
  InteractionResult,
  InteractionState,
  Point,
  TimeRange,
} from './types';

// ──────────────────────────────────────────────
// Pointer event 抽象（DOM 型のみ依存）
// ──────────────────────────────────────────────
export { clientYToGridY, constrainToRect, getPointerPoint, isTouchEvent } from './pointer-tracker';

// ──────────────────────────────────────────────
// Time / pixel 変換
// ──────────────────────────────────────────────
export {
  addMinutesToTime,
  pixelsToTime,
  pixelsToTimeUnsnapped,
  snapDeltaToGrid,
  timeToPixels,
} from './time-math';

// ──────────────────────────────────────────────
// 空白選択ルール
// ──────────────────────────────────────────────
export { calculateSelection, createInstantSelection } from './selection-rules';
export type { DateSelectionRange, HourMinute, SelectionRange } from './selection-rules';
