/**
 * Interaction Module — 統合インタラクションシステム
 *
 * ドラッグ/リサイズ/選択を1つの状態機械で管理。
 */

// Types
export type {
  DraggingState,
  EntryRect,
  IdleState,
  InteractionAction,
  InteractionContext,
  InteractionEffect,
  InteractionResult,
  InteractionState,
  LongPressPendingState,
  PendingState,
  Point,
  ResizingState,
  SelectingState,
  SelectionLongPressPendingState,
  TimeRange,
} from './types';

// Machine
export {
  DRAG_THRESHOLD_PX,
  IDLE,
  LONGPRESS_DELAY_MS,
  SELECTION_LONGPRESS_DELAY_MS,
  TOUCH_SCROLL_THRESHOLD_PX,
  interactionReducer,
  snapToGrid,
} from './machine';

// Time math
export {
  addMinutesToTime,
  formatTimeString,
  parseTimeString,
  pixelsToTime,
  timeToPixels,
} from './time-math';

// Pointer tracker
export { clientYToGridY, constrainToRect, getPointerPoint, isTouchEvent } from './pointer-tracker';

// React hook
export { useInteraction } from './useInteraction';
export type {
  InteractionHandlers,
  UseInteractionProps,
  UseInteractionReturn,
} from './useInteraction';

// Ghost renderer
export { GhostRenderer } from './GhostRenderer';
export type { GhostRenderParams } from './GhostRenderer';
