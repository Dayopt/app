/**
 * selectionReducer のユニットテスト
 *
 * ドラッグ選択の状態遷移（mouse / touch / 外部表示）を純粋関数として検証する。
 */

import { describe, expect, it } from 'vitest';

import { IDLE, selectionReducer, type SelectionMode } from '../selection-reducer';

const start = { hour: 9, minute: 0 };

describe('selectionReducer', () => {
  describe('mouse flow', () => {
    it('MOUSE_DOWN: idle → mouse-selecting（初期 15 分選択）', () => {
      const next = selectionReducer(IDLE, { type: 'MOUSE_DOWN', start, startPixelY: 540 });

      expect(next).toEqual({
        type: 'mouse-selecting',
        start,
        startPixelY: 540,
        hasDragged: false,
        selection: { startHour: 9, startMinute: 0, endHour: 9, endMinute: 15 },
        isOverlapping: false,
      });
    });

    it('MOUSE_MOVE: mouse-selecting 中は選択範囲・ドラッグ判定・重複を更新する', () => {
      const selecting = selectionReducer(IDLE, { type: 'MOUSE_DOWN', start, startPixelY: 540 });
      const selection = { startHour: 9, startMinute: 0, endHour: 10, endMinute: 30 };

      const next = selectionReducer(selecting, {
        type: 'MOUSE_MOVE',
        selection,
        hasDragged: true,
        isOverlapping: true,
      });

      expect(next).toMatchObject({
        type: 'mouse-selecting',
        selection,
        hasDragged: true,
        isOverlapping: true,
      });
    });

    it('MOUSE_MOVE: mouse-selecting 以外では無視する', () => {
      const next = selectionReducer(IDLE, {
        type: 'MOUSE_MOVE',
        selection: { startHour: 9, startMinute: 0, endHour: 10, endMinute: 0 },
        hasDragged: true,
        isOverlapping: false,
      });

      expect(next).toBe(IDLE);
    });

    it('MOUSE_UP: idle に戻る', () => {
      const selecting = selectionReducer(IDLE, { type: 'MOUSE_DOWN', start, startPixelY: 540 });
      expect(selectionReducer(selecting, { type: 'MOUSE_UP' })).toEqual(IDLE);
    });
  });

  describe('touch flow', () => {
    const touchStart: SelectionMode = selectionReducer(IDLE, {
      type: 'TOUCH_START',
      startTime: start,
      startPixelY: 540,
      startPos: { x: 100, y: 700 },
    });

    it('TOUCH_START: idle → touch-pending', () => {
      expect(touchStart).toEqual({
        type: 'touch-pending',
        startPixelY: 540,
        startPos: { x: 100, y: 700 },
        startTime: start,
      });
    });

    it('LONGPRESS_FIRED: touch-pending → touch-selecting（初期 15 分選択）', () => {
      const next = selectionReducer(touchStart, {
        type: 'LONGPRESS_FIRED',
        start,
        startPixelY: 540,
      });

      expect(next).toEqual({
        type: 'touch-selecting',
        start,
        startPixelY: 540,
        hasDragged: false,
        selection: { startHour: 9, startMinute: 0, endHour: 9, endMinute: 15 },
        isOverlapping: false,
      });
    });

    it('TOUCH_MOVE: touch-selecting 以外（touch-pending）では無視する', () => {
      const next = selectionReducer(touchStart, {
        type: 'TOUCH_MOVE',
        selection: { startHour: 9, startMinute: 0, endHour: 10, endMinute: 0 },
        hasDragged: true,
        isOverlapping: false,
      });

      expect(next).toBe(touchStart);
    });

    it('TOUCH_END / CANCEL: idle に戻る', () => {
      expect(selectionReducer(touchStart, { type: 'TOUCH_END' })).toEqual(IDLE);
      expect(selectionReducer(touchStart, { type: 'CANCEL' })).toEqual(IDLE);
    });
  });

  describe('external selection', () => {
    it('SHOW_EXTERNAL: 任意の状態から show-external になる', () => {
      const selection = { startHour: 14, startMinute: 0, endHour: 15, endMinute: 30 };
      const next = selectionReducer(IDLE, { type: 'SHOW_EXTERNAL', selection });

      expect(next).toEqual({ type: 'show-external', selection });
    });
  });
});
