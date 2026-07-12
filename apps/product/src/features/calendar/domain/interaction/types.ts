/**
 * Interaction State Machine — 型定義
 *
 * カレンダーのドラッグ/リサイズ/選択を1つの状態機械で統合。
 * TypeScript判別共用体で不正状態を型レベルで防止。
 * React/DOM依存ゼロ。
 */

// ========================================
// Primitives
// ========================================

/** 正規化されたポインター座標（ビューポート相対） */
export interface Point {
  clientX: number;
  clientY: number;
}

/** 開始・終了を持つ時間範囲 */
export interface TimeRange {
  start: Date;
  end: Date;
}

/** グリッド上のエントリ位置（px） */
export interface TimeblockRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// ========================================
// States (discriminated union)
// ========================================

/** カレンダーインタラクションの状態（判別共用体） */
export type InteractionState =
  | IdleState
  | PendingState
  | LongPressPendingState
  | DraggingState
  | ResizingState
  | SelectingState
  | SelectionLongPressPendingState;

/** No interaction active */
export interface IdleState {
  mode: 'idle';
}

/** Mouse down on event, waiting for 5px movement (→drag) or mouseup (→click) */
export interface PendingState {
  mode: 'pending';
  entryId: string;
  startPoint: Point;
  originalPosition: TimeblockRect;
  dateIndex: number;
}

/** Touch on event, waiting for 500ms long-press or 10px movement (→scroll cancel) */
export interface LongPressPendingState {
  mode: 'longpress-pending';
  entryId: string;
  startPoint: Point;
  originalPosition: TimeblockRect;
  dateIndex: number;
}

/** Actively dragging an event */
export interface DraggingState {
  mode: 'dragging';
  entryId: string;
  startPoint: Point;
  currentPoint: Point;
  originalPosition: TimeblockRect;
  /** Column the drag originated from */
  dateIndex: number;
  /** Column the drag is currently over */
  targetDateIndex: number;
  /** Snapped Y position on grid (px) */
  snappedTop: number;
  /** Preview time range at current position */
  previewTime: TimeRange;
  /** Whether the current position overlaps with same-origin entries */
  isOverlapping: boolean;
}

/** Actively resizing an event (bottom edge) */
export interface ResizingState {
  mode: 'resizing';
  entryId: string;
  startPoint: Point;
  currentPoint: Point;
  originalPosition: TimeblockRect;
  direction: 'top' | 'bottom';
  /** Snapped height (px) */
  snappedHeight: number;
  /** Preview time range at current size */
  previewTime: TimeRange;
  isOverlapping: boolean;
}

/** Dragging on empty grid to select time range */
export interface SelectingState {
  mode: 'selecting';
  startPoint: Point;
  currentPoint: Point;
  dateIndex: number;
  /** Grid-relative Y of selection start (px) */
  gridStartY: number;
  /** Selected time range */
  selectionRange: TimeRange;
  isOverlapping: boolean;
}

/** Touch on empty grid, waiting for 300ms long-press before selection */
export interface SelectionLongPressPendingState {
  mode: 'selection-longpress-pending';
  startPoint: Point;
  dateIndex: number;
  /** Grid-relative Y of touch start (px) */
  gridStartY: number;
}

// ========================================
// Actions
// ========================================

/** インタラクション状態機械に送るアクション */
export type InteractionAction =
  | {
      type: 'POINTER_DOWN';
      entryId: string;
      point: Point;
      originalPosition: TimeblockRect;
      dateIndex: number;
    }
  | {
      type: 'TOUCH_START';
      entryId: string;
      point: Point;
      originalPosition: TimeblockRect;
      dateIndex: number;
    }
  | { type: 'LONGPRESS_FIRED' }
  | { type: 'POINTER_MOVE'; point: Point; targetDateIndex?: number }
  | { type: 'POINTER_UP' }
  | {
      type: 'RESIZE_START';
      entryId: string;
      direction: 'top' | 'bottom';
      point: Point;
      originalPosition: TimeblockRect;
    }
  | { type: 'GRID_POINTER_DOWN'; point: Point; dateIndex: number; gridY: number }
  | { type: 'GRID_TOUCH_START'; point: Point; dateIndex: number; gridY: number }
  | { type: 'GRID_LONGPRESS_FIRED' }
  | { type: 'CANCEL' };

// ========================================
// Context (injected dependencies)
// ========================================

/** レデューサーに注入する依存コンテキスト */
export interface InteractionContext {
  /** Pixels per hour on the time grid */
  hourHeight: number;
  /** Base date of the current view */
  date: Date;
  /** All displayed dates (for week/multi-day views) */
  displayDates?: Date[];
  /** Current view mode */
  viewMode: 'day' | '3day' | '5day' | 'week';
  /** Snap interval in minutes (default: 15) */
  snapIntervalMinutes?: number;
  /** Get entry duration in milliseconds by ID */
  getEntryDurationMs: (entryId: string) => number;
  /** planned resize の終了時刻に必要な下限（分 of day）。未指定なら通常の最小durationのみ。 */
  getResizeMinEndMinutes?: (entryId: string) => number | null;
  /** Check if a time range overlaps with other same-origin entries */
  checkOverlap: (entryId: string, start: Date, end: Date, operation: 'drag' | 'resize') => boolean;
}

// ========================================
// Effects (side effects for the hook to execute)
// ========================================

/** レデューサーが返すサイドエフェクト（hookが実行する） */
export type InteractionEffect =
  | { type: 'START_LONGPRESS_TIMER'; delayMs: number }
  | { type: 'CLEAR_LONGPRESS_TIMER' }
  | { type: 'HAPTIC'; pattern: 'tap' | 'impact' | 'error' }
  | { type: 'EVENT_CLICK'; entryId: string }
  | { type: 'DROP'; entryId: string; time: TimeRange; targetDateIndex: number }
  | { type: 'DROP_REJECTED'; entryId: string; reason: 'overlap' }
  | { type: 'RESIZE_COMPLETE'; entryId: string; time: TimeRange }
  | { type: 'RESIZE_REJECTED'; entryId: string; reason: 'overlap' }
  | { type: 'SELECT_COMPLETE'; dateIndex: number; range: TimeRange }
  | { type: 'DRAG_STORE_START'; entryId: string; dateIndex: number }
  | { type: 'DRAG_STORE_UPDATE'; targetDateIndex: number }
  | { type: 'DRAG_STORE_END' };

/** レデューサーの戻り値型: 新しい状態 + 実行するサイドエフェクト */
export interface InteractionResult {
  state: InteractionState;
  effects: InteractionEffect[];
}
