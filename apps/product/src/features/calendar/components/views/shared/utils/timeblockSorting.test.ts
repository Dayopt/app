import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '../../../../types/calendar.types';

import {
  sortAgendaEventsByDateKeys,
  sortEventsByDateKeys,
  sortEventsByTime,
  sortEventsForAgenda,
} from './timeblockSorting';

function makeEntry(id: string, startDate: Date | null): CalendarEvent {
  return {
    id,
    title: `Entry ${id}`,
    startDate,
    endDate: startDate ? new Date(startDate.getTime() + 3600000) : null,
    status: 'open',
    color: '#000',
    createdAt: new Date(),
    updatedAt: new Date(),
    displayStartDate: startDate ?? new Date(),
    displayEndDate: startDate ? new Date(startDate.getTime() + 3600000) : new Date(),
    duration: 60,
    isMultiDay: false,
  };
}

describe('entrySorting', () => {
  describe('sortEventsByTime', () => {
    it('時刻昇順でソートする', () => {
      const entries = [
        makeEntry('c', new Date('2026-02-21T14:00:00')),
        makeEntry('a', new Date('2026-02-21T09:00:00')),
        makeEntry('b', new Date('2026-02-21T11:00:00')),
      ];
      const sorted = sortEventsByTime(entries);
      expect(sorted.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    });

    it('startDateがnullのイベントは先頭に来る', () => {
      const entries = [makeEntry('b', new Date('2026-02-21T10:00:00')), makeEntry('a', null)];
      const sorted = sortEventsByTime(entries);
      expect(sorted[0]!.id).toBe('a');
    });

    it('元の配列を変更しない', () => {
      const entries = [
        makeEntry('b', new Date('2026-02-21T14:00:00')),
        makeEntry('a', new Date('2026-02-21T09:00:00')),
      ];
      const original = [...entries];
      sortEventsByTime(entries);
      expect(entries.map((p) => p.id)).toEqual(original.map((p) => p.id));
    });

    it('空配列を処理できる', () => {
      expect(sortEventsByTime([])).toEqual([]);
    });
  });

  describe('sortEventsByDateKeys', () => {
    it('各日付キーのイベントをソートする', () => {
      const eventsByDate: Record<string, CalendarEvent[]> = {
        '2026-02-21': [
          makeEntry('b', new Date('2026-02-21T14:00:00')),
          makeEntry('a', new Date('2026-02-21T09:00:00')),
        ],
        '2026-02-22': [
          makeEntry('d', new Date('2026-02-22T16:00:00')),
          makeEntry('c', new Date('2026-02-22T08:00:00')),
        ],
      };

      const sorted = sortEventsByDateKeys(eventsByDate);
      expect(sorted['2026-02-21']!.map((p) => p.id)).toEqual(['a', 'b']);
      expect(sorted['2026-02-22']!.map((p) => p.id)).toEqual(['c', 'd']);
    });
  });

  describe('sortEventsForAgenda', () => {
    it('sortEventsByTimeと同じ結果を返す', () => {
      const entries = [
        makeEntry('b', new Date('2026-02-21T14:00:00')),
        makeEntry('a', new Date('2026-02-21T09:00:00')),
      ];
      const sorted = sortEventsForAgenda(entries);
      expect(sorted.map((p) => p.id)).toEqual(['a', 'b']);
    });
  });

  describe('sortAgendaEventsByDateKeys', () => {
    it('各日付キーのイベントをAgenda用にソートする', () => {
      const eventsByDate: Record<string, CalendarEvent[]> = {
        '2026-02-21': [
          makeEntry('b', new Date('2026-02-21T14:00:00')),
          makeEntry('a', new Date('2026-02-21T09:00:00')),
        ],
      };

      const sorted = sortAgendaEventsByDateKeys(eventsByDate);
      expect(sorted['2026-02-21']!.map((p) => p.id)).toEqual(['a', 'b']);
    });
  });
});
