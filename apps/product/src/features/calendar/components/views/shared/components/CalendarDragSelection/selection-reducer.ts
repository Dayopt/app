/**
 * ドラッグ選択の状態レデューサー
 *
 * React/DOM 依存ゼロの純粋関数。useDragSelection の useReducer から使う。
 */

import type { TimeRange } from './types';

export type SelectionMode =
  | { type: 'idle' }
  | {
      type: 'mouse-selecting';
      start: { hour: number; minute: number };
      startPixelY: number;
      hasDragged: boolean;
      selection: TimeRange;
      isOverlapping: boolean;
    }
  | {
      type: 'touch-pending';
      startPixelY: number;
      startPos: { x: number; y: number };
      startTime: { hour: number; minute: number };
    }
  | {
      type: 'touch-selecting';
      start: { hour: number; minute: number };
      startPixelY: number;
      hasDragged: boolean;
      selection: TimeRange;
      isOverlapping: boolean;
    }
  | {
      type: 'show-external';
      selection: TimeRange;
    };

export type SelectionAction =
  | { type: 'MOUSE_DOWN'; start: { hour: number; minute: number }; startPixelY: number }
  | { type: 'MOUSE_MOVE'; selection: TimeRange; hasDragged: boolean; isOverlapping: boolean }
  | { type: 'MOUSE_UP' }
  | {
      type: 'TOUCH_START';
      startTime: { hour: number; minute: number };
      startPixelY: number;
      startPos: { x: number; y: number };
    }
  | { type: 'LONGPRESS_FIRED'; start: { hour: number; minute: number }; startPixelY: number }
  | { type: 'TOUCH_MOVE'; selection: TimeRange; hasDragged: boolean; isOverlapping: boolean }
  | { type: 'TOUCH_END' }
  | { type: 'CANCEL' }
  | { type: 'SHOW_EXTERNAL'; selection: TimeRange };

export const IDLE: SelectionMode = { type: 'idle' };

export function selectionReducer(state: SelectionMode, action: SelectionAction): SelectionMode {
  switch (action.type) {
    case 'MOUSE_DOWN':
      return {
        type: 'mouse-selecting',
        start: action.start,
        startPixelY: action.startPixelY,
        hasDragged: false,
        selection: {
          startHour: action.start.hour,
          startMinute: action.start.minute,
          endHour: action.start.hour,
          endMinute: action.start.minute + 15,
        },
        isOverlapping: false,
      };
    case 'MOUSE_MOVE':
      if (state.type !== 'mouse-selecting') return state;
      return {
        ...state,
        selection: action.selection,
        hasDragged: action.hasDragged,
        isOverlapping: action.isOverlapping,
      };
    case 'MOUSE_UP':
    case 'TOUCH_END':
    case 'CANCEL':
      return IDLE;
    case 'TOUCH_START':
      return {
        type: 'touch-pending',
        startPixelY: action.startPixelY,
        startPos: action.startPos,
        startTime: action.startTime,
      };
    case 'LONGPRESS_FIRED':
      return {
        type: 'touch-selecting',
        start: action.start,
        startPixelY: action.startPixelY,
        hasDragged: false,
        selection: {
          startHour: action.start.hour,
          startMinute: action.start.minute,
          endHour: action.start.hour,
          endMinute: action.start.minute + 15,
        },
        isOverlapping: false,
      };
    case 'TOUCH_MOVE':
      if (state.type !== 'touch-selecting') return state;
      return {
        ...state,
        selection: action.selection,
        hasDragged: action.hasDragged,
        isOverlapping: action.isOverlapping,
      };
    case 'SHOW_EXTERNAL':
      return { type: 'show-external', selection: action.selection };
    default:
      return state;
  }
}
