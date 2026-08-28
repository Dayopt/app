import { describe, expect, it } from 'vitest';

import type { CalendarDisplayEvent } from '../types/calendar.types';

import { checkClientSideOverlap } from './overlap';

function createEvent(
  overrides: Partial<CalendarDisplayEvent> & { id: string; startDate: Date; endDate: Date },
): CalendarDisplayEvent {
  return {
    title: 'Test',
    displayStartDate: overrides.startDate,
    displayEndDate: overrides.endDate,
    duration: 60,
    isMultiDay: false,

    status: 'open',
    color: '',
    createdAt: new Date(),
    updatedAt: new Date(),
    origin: 'planned',
    ...overrides,
  } as CalendarDisplayEvent;
}

describe('checkClientSideOverlap — エッジケース', () => {
  describe('接触境界（touch-but-not-overlap）', () => {
    it('A.endDate === B.startDate は重複なし（半開区間）', () => {
      const events = [
        createEvent({
          id: 'a',
          startDate: new Date('2026-01-15T10:00'),
          endDate: new Date('2026-01-15T11:00'),
        }),
      ];
      // プレビューが A の直後に接触
      expect(
        checkClientSideOverlap(
          events,
          'dragged',
          new Date('2026-01-15T11:00'),
          new Date('2026-01-15T12:00'),
        ),
      ).toBe(false);
    });

    it('A.startDate === B.endDate は重複なし', () => {
      const events = [
        createEvent({
          id: 'a',
          startDate: new Date('2026-01-15T12:00'),
          endDate: new Date('2026-01-15T13:00'),
        }),
      ];
      // プレビューが A の直前に接触
      expect(
        checkClientSideOverlap(
          events,
          'dragged',
          new Date('2026-01-15T11:00'),
          new Date('2026-01-15T12:00'),
        ),
      ).toBe(false);
    });
  });

  describe('0分ブロック（start === end）', () => {
    it('0分の既存イベントが区間内にある場合は重複と判定', () => {
      const events = [
        createEvent({
          id: 'a',
          startDate: new Date('2026-01-15T10:00'),
          endDate: new Date('2026-01-15T10:00'), // 0分
        }),
      ];
      // 条件: startDate(10:00) < previewEnd(11:00) && endDate(10:00) > previewStart(09:00) → true
      expect(
        checkClientSideOverlap(
          events,
          'dragged',
          new Date('2026-01-15T09:00'),
          new Date('2026-01-15T11:00'),
        ),
      ).toBe(true);
    });

    it('0分のプレビューが既存イベント内にある場合は重複と判定', () => {
      const events = [
        createEvent({
          id: 'a',
          startDate: new Date('2026-01-15T09:00'),
          endDate: new Date('2026-01-15T11:00'),
        }),
      ];
      // 0分プレビュー: start === end === 10:00
      // 条件: startDate(09:00) < previewEnd(10:00) && endDate(11:00) > previewStart(10:00) → true
      expect(
        checkClientSideOverlap(
          events,
          'dragged',
          new Date('2026-01-15T10:00'),
          new Date('2026-01-15T10:00'),
        ),
      ).toBe(true);
    });

    it('0分の既存イベントが区間の端にある場合は重複なし', () => {
      const events = [
        createEvent({
          id: 'a',
          startDate: new Date('2026-01-15T11:00'),
          endDate: new Date('2026-01-15T11:00'), // 0分、プレビュー終了と同一
        }),
      ];
      // 条件: startDate(11:00) < previewEnd(11:00) && endDate(11:00) > previewStart(09:00)
      // 11:00 < 11:00 → false → 重複なし
      expect(
        checkClientSideOverlap(
          events,
          'dragged',
          new Date('2026-01-15T09:00'),
          new Date('2026-01-15T11:00'),
        ),
      ).toBe(false);
    });
  });

  describe('null startDate/endDate を持つイベント', () => {
    it('startDate が null のイベントは重複判定から除外', () => {
      const events = [
        createEvent({
          id: 'a',
          startDate: null as never,
          endDate: new Date('2026-01-15T11:00'),
        }),
      ];
      expect(
        checkClientSideOverlap(
          events,
          'dragged',
          new Date('2026-01-15T10:00'),
          new Date('2026-01-15T12:00'),
        ),
      ).toBe(false);
    });

    it('endDate が null のイベントは重複判定から除外', () => {
      const events = [
        createEvent({
          id: 'a',
          startDate: new Date('2026-01-15T10:00'),
          endDate: null as never,
        }),
      ];
      expect(
        checkClientSideOverlap(
          events,
          'dragged',
          new Date('2026-01-15T10:00'),
          new Date('2026-01-15T12:00'),
        ),
      ).toBe(false);
    });
  });

  describe('空の events 配列', () => {
    it('events が空なら常に false', () => {
      expect(
        checkClientSideOverlap(
          [],
          'dragged',
          new Date('2026-01-15T10:00'),
          new Date('2026-01-15T11:00'),
        ),
      ).toBe(false);
    });
  });

  describe('完全内包', () => {
    it('プレビューが既存イベントを完全に内包する場合は重複', () => {
      const events = [
        createEvent({
          id: 'a',
          startDate: new Date('2026-01-15T10:00'),
          endDate: new Date('2026-01-15T11:00'),
        }),
      ];
      expect(
        checkClientSideOverlap(
          events,
          'dragged',
          new Date('2026-01-15T08:00'),
          new Date('2026-01-15T14:00'),
        ),
      ).toBe(true);
    });

    it('既存イベントがプレビューを完全に内包する場合は重複', () => {
      const events = [
        createEvent({
          id: 'a',
          startDate: new Date('2026-01-15T08:00'),
          endDate: new Date('2026-01-15T14:00'),
        }),
      ];
      expect(
        checkClientSideOverlap(
          events,
          'dragged',
          new Date('2026-01-15T10:00'),
          new Date('2026-01-15T11:00'),
        ),
      ).toBe(true);
    });
  });

  describe('複数イベントの部分重複', () => {
    it('3イベント中1つだけ重複する場合は true', () => {
      const events = [
        createEvent({
          id: 'a',
          startDate: new Date('2026-01-15T08:00'),
          endDate: new Date('2026-01-15T09:00'),
        }),
        createEvent({
          id: 'b',
          startDate: new Date('2026-01-15T10:30'),
          endDate: new Date('2026-01-15T11:30'),
        }),
        createEvent({
          id: 'c',
          startDate: new Date('2026-01-15T14:00'),
          endDate: new Date('2026-01-15T15:00'),
        }),
      ];
      // プレビュー: 10:00–11:00 → b(10:30–11:30)と重複
      expect(
        checkClientSideOverlap(
          events,
          'dragged',
          new Date('2026-01-15T10:00'),
          new Date('2026-01-15T11:00'),
        ),
      ).toBe(true);
    });

    it('3イベント全て隣接（重複なし）なら false', () => {
      const events = [
        createEvent({
          id: 'a',
          startDate: new Date('2026-01-15T08:00'),
          endDate: new Date('2026-01-15T09:00'),
        }),
        createEvent({
          id: 'b',
          startDate: new Date('2026-01-15T10:00'),
          endDate: new Date('2026-01-15T11:00'),
        }),
        createEvent({
          id: 'c',
          startDate: new Date('2026-01-15T12:00'),
          endDate: new Date('2026-01-15T13:00'),
        }),
      ];
      // プレビュー: 09:00–10:00 → 全て接触のみ、重複なし
      expect(
        checkClientSideOverlap(
          events,
          'dragged',
          new Date('2026-01-15T09:00'),
          new Date('2026-01-15T10:00'),
        ),
      ).toBe(false);
    });
  });
});
