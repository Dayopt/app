import { describe, expect, it } from 'vitest';

import { calculateViewDateRange, getNextPeriod, getPreviousPeriod } from '../view-range';

const multiDayViewTypes = ['2day', '3day', '4day', '5day', '6day', '7day'] as const;
const weekendRoundTripCases = multiDayViewTypes.flatMap((viewType) =>
  ['2026-01-17T12:00:00', '2026-01-18T12:00:00'].map((anchor) => [viewType, anchor] as const),
);

describe('calculateViewDateRange', () => {
  describe('day view', () => {
    it('1日分の範囲を返す', () => {
      const date = new Date('2026-01-15T12:00:00');
      const range = calculateViewDateRange('day', date);

      expect(range.days).toHaveLength(1);
      expect(range.start.getHours()).toBe(0);
      expect(range.end.getHours()).toBe(23);
    });
  });

  describe('week view', () => {
    it('7日分の範囲を返す', () => {
      const date = new Date('2026-01-15T12:00:00'); // 木曜日
      const range = calculateViewDateRange('week', date, 1); // 月曜始まり

      expect(range.days).toHaveLength(7);
      // 月曜始まり: 2026-01-12(月) 〜 2026-01-18(日)
      expect(range.start.getDay()).toBe(1); // 月曜日
    });

    it('日曜始まりに対応', () => {
      const date = new Date('2026-01-15T12:00:00');
      const range = calculateViewDateRange('week', date, 0);

      expect(range.days).toHaveLength(7);
      expect(range.start.getDay()).toBe(0); // 日曜日
    });

    it('週末非表示では実際に表示する月〜金を範囲にする', () => {
      const date = new Date('2026-01-15T12:00:00');
      const range = calculateViewDateRange('week', date, 1, false);

      expect(range.days.map((day) => day.getDay())).toEqual([1, 2, 3, 4, 5]);
      expect(range.start.getDay()).toBe(1);
      expect(range.end.getDay()).toBe(5);
    });
  });

  describe('multi-day view', () => {
    it('3day: currentDateを中心に3日分を返す', () => {
      const date = new Date('2026-01-15T12:00:00');
      const range = calculateViewDateRange('3day', date);

      expect(range.days).toHaveLength(3);
      // offset = floor(3/2) = 1
      // start = 1/14, end = 1/16
      expect(range.days[0]!.getDate()).toBe(14);
      expect(range.days[2]!.getDate()).toBe(16);
    });

    it('5day: 5日分を返す', () => {
      const date = new Date('2026-01-15T12:00:00');
      const range = calculateViewDateRange('5day', date);

      expect(range.days).toHaveLength(5);
    });

    it('週末非表示では表示する営業日を飛ばさず query 範囲へ含める', () => {
      const friday = new Date('2026-01-16T12:00:00');
      const range = calculateViewDateRange('3day', friday, 1, false);

      expect(range.days.map((day) => day.getDate())).toEqual([15, 16, 19]);
      expect(range.start.getDate()).toBe(15);
      expect(range.end.getDate()).toBe(19);
    });

    it('7dayかつ週末非表示では中央日を基準に7営業日を返す', () => {
      const thursday = new Date('2026-01-15T12:00:00');
      const range = calculateViewDateRange('7day', thursday, 1, false);

      expect(range.days).toHaveLength(7);
      expect(range.days.map((day) => day.getDay())).toEqual([1, 2, 3, 4, 5, 1, 2]);
    });
  });
});

describe('getNextPeriod', () => {
  it('day: 1日進む', () => {
    const date = new Date('2026-01-15');
    const next = getNextPeriod('day', date);
    expect(next.getDate()).toBe(16);
  });

  it('week: 7日進む', () => {
    const date = new Date('2026-01-15');
    const next = getNextPeriod('week', date);
    expect(next.getDate()).toBe(22);
  });

  it('3day: 3日進む', () => {
    const date = new Date('2026-01-15');
    const next = getNextPeriod('3day', date);
    expect(next.getDate()).toBe(18);
  });

  it('週末非表示の7dayは7営業日進み、表示日が前期間と重複しない', () => {
    const date = new Date('2026-01-15T12:00:00');
    const current = calculateViewDateRange('7day', date, 1, false);
    const nextDate = getNextPeriod('7day', date, false);
    const next = calculateViewDateRange('7day', nextDate, 1, false);

    expect(nextDate.toISOString().slice(0, 10)).toBe('2026-01-26');
    expect(next.days.map((day) => day.toISOString().slice(0, 10))).toEqual([
      '2026-01-21',
      '2026-01-22',
      '2026-01-23',
      '2026-01-26',
      '2026-01-27',
      '2026-01-28',
      '2026-01-29',
    ]);
    expect(
      next.days.some((day) =>
        current.days.some((currentDay) => currentDay.getTime() === day.getTime()),
      ),
    ).toBe(false);
  });

  it('週末anchorの3dayは次期間から戻ると元の表示期間を復元する', () => {
    const weekend = new Date('2026-01-17T12:00:00');
    const current = calculateViewDateRange('3day', weekend, 1, false);
    const nextDate = getNextPeriod('3day', weekend, false);
    const next = calculateViewDateRange('3day', nextDate, 1, false);
    const restoredDate = getPreviousPeriod('3day', nextDate, false);
    const restored = calculateViewDateRange('3day', restoredDate, 1, false);

    expect(nextDate.toISOString().slice(0, 10)).toBe('2026-01-22');
    expect(next.days.map((day) => day.toISOString().slice(0, 10))).toEqual([
      '2026-01-21',
      '2026-01-22',
      '2026-01-23',
    ]);
    expect(
      next.days.some((day) =>
        current.days.some((currentDay) => currentDay.getTime() === day.getTime()),
      ),
    ).toBe(false);
    expect(restored.days).toEqual(current.days);
  });
});

describe('getPreviousPeriod', () => {
  it('day: 1日戻る', () => {
    const date = new Date('2026-01-15');
    const prev = getPreviousPeriod('day', date);
    expect(prev.getDate()).toBe(14);
  });

  it('week: 7日戻る', () => {
    const date = new Date('2026-01-15');
    const prev = getPreviousPeriod('week', date);
    expect(prev.getDate()).toBe(8);
  });

  it('3day: 3日戻る', () => {
    const date = new Date('2026-01-15');
    const prev = getPreviousPeriod('3day', date);
    expect(prev.getDate()).toBe(12);
  });

  it('週末非表示の7dayは7営業日戻り、表示日が次期間と重複しない', () => {
    const date = new Date('2026-01-15T12:00:00');
    const current = calculateViewDateRange('7day', date, 1, false);
    const previousDate = getPreviousPeriod('7day', date, false);
    const previous = calculateViewDateRange('7day', previousDate, 1, false);

    expect(previousDate.toISOString().slice(0, 10)).toBe('2026-01-06');
    expect(previous.days.map((day) => day.toISOString().slice(0, 10))).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
    ]);
    expect(
      previous.days.some((day) =>
        current.days.some((currentDay) => currentDay.getTime() === day.getTime()),
      ),
    ).toBe(false);
  });

  it('週末anchorの3dayは前期間から進むと元の表示期間を復元する', () => {
    const weekend = new Date('2026-01-17T12:00:00');
    const current = calculateViewDateRange('3day', weekend, 1, false);
    const previousDate = getPreviousPeriod('3day', weekend, false);
    const previous = calculateViewDateRange('3day', previousDate, 1, false);
    const restoredDate = getNextPeriod('3day', previousDate, false);
    const restored = calculateViewDateRange('3day', restoredDate, 1, false);

    expect(previousDate.toISOString().slice(0, 10)).toBe('2026-01-14');
    expect(previous.days.map((day) => day.toISOString().slice(0, 10))).toEqual([
      '2026-01-13',
      '2026-01-14',
      '2026-01-15',
    ]);
    expect(
      previous.days.some((day) =>
        current.days.some((currentDay) => currentDay.getTime() === day.getTime()),
      ),
    ).toBe(false);
    expect(restored.days).toEqual(current.days);
  });
});

describe('週末非表示multi-dayの期間移動', () => {
  it.each(weekendRoundTripCases)(
    '%sは週末anchor %sでも前後の期間と重複せず往復できる',
    (viewType, anchor) => {
      const weekend = new Date(anchor);
      const current = calculateViewDateRange(viewType, weekend, 1, false);

      const nextDate = getNextPeriod(viewType, weekend, false);
      const next = calculateViewDateRange(viewType, nextDate, 1, false);
      const restoredFromNext = calculateViewDateRange(
        viewType,
        getPreviousPeriod(viewType, nextDate, false),
        1,
        false,
      );

      const previousDate = getPreviousPeriod(viewType, weekend, false);
      const previous = calculateViewDateRange(viewType, previousDate, 1, false);
      const restoredFromPrevious = calculateViewDateRange(
        viewType,
        getNextPeriod(viewType, previousDate, false),
        1,
        false,
      );

      expect(
        next.days.some((day) =>
          current.days.some((currentDay) => currentDay.getTime() === day.getTime()),
        ),
      ).toBe(false);
      expect(
        previous.days.some((day) =>
          current.days.some((currentDay) => currentDay.getTime() === day.getTime()),
        ),
      ).toBe(false);
      expect(restoredFromNext.days).toEqual(current.days);
      expect(restoredFromPrevious.days).toEqual(current.days);
    },
  );
});
