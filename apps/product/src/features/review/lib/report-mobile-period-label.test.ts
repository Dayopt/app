import { enUS, ja } from 'date-fns/locale';
import { describe, expect, it } from 'vitest';

import { formatReportMobilePeriod } from './report-mobile-period-label';

const JA_PATTERNS = {
  weekDay: 'M月d日',
  weekDayShort: 'd日',
  weekRange: '{start}〜{end}',
  month: 'M月',
  year: "yyyy'年'",
};
const EN_PATTERNS = {
  weekDay: 'MMM d',
  weekDayShort: 'd',
  weekRange: '{start} – {end}',
  month: 'MMMM',
  year: 'yyyy',
};

describe('formatReportMobilePeriod', () => {
  /** 同じ月に収まる週は月を 1 回だけ出す（2026-09-07 User 指示）。 */
  it('同月に収まる週は終端から月を落とす', () => {
    expect(
      formatReportMobilePeriod({
        granularity: 'week',
        periodStart: new Date(2026, 8, 14),
        periodEnd: new Date(2026, 8, 20),
        dateFnsLocale: ja,
        patterns: JA_PATTERNS,
      }),
    ).toBe('9月14日〜20日');

    expect(
      formatReportMobilePeriod({
        granularity: 'week',
        periodStart: new Date(2026, 8, 14),
        periodEnd: new Date(2026, 8, 20),
        dateFnsLocale: enUS,
        patterns: EN_PATTERNS,
      }),
    ).toBe('Sep 14 – 20');
  });

  it('月をまたぐ週は両側に月を出す', () => {
    expect(
      formatReportMobilePeriod({
        granularity: 'week',
        periodStart: new Date(2026, 7, 31),
        periodEnd: new Date(2026, 8, 6),
        dateFnsLocale: ja,
        patterns: JA_PATTERNS,
      }),
    ).toBe('8月31日〜9月6日');

    expect(
      formatReportMobilePeriod({
        granularity: 'week',
        periodStart: new Date(2026, 7, 31),
        periodEnd: new Date(2026, 8, 6),
        dateFnsLocale: enUS,
        patterns: EN_PATTERNS,
      }),
    ).toBe('Aug 31 – Sep 6');
  });

  /** 年をまたぐ週でも年は足さない（デスクトップの範囲テキストとは判断が違う）。 */
  it('年をまたぐ週でも年を出さない', () => {
    expect(
      formatReportMobilePeriod({
        granularity: 'week',
        periodStart: new Date(2026, 11, 28),
        periodEnd: new Date(2027, 0, 3),
        dateFnsLocale: ja,
        patterns: JA_PATTERNS,
      }),
    ).toBe('12月28日〜1月3日');
  });

  it('月は年を出さない', () => {
    expect(
      formatReportMobilePeriod({
        granularity: 'month',
        periodStart: new Date(2026, 8, 1),
        periodEnd: new Date(2026, 8, 30),
        dateFnsLocale: ja,
        patterns: JA_PATTERNS,
      }),
    ).toBe('9月');
  });

  /** 年粒度だけは年を残す。落とすと出すものが無くなる。 */
  it('年粒度は年を出す', () => {
    expect(
      formatReportMobilePeriod({
        granularity: 'year',
        periodStart: new Date(2026, 0, 1),
        periodEnd: new Date(2026, 11, 31),
        dateFnsLocale: ja,
        patterns: JA_PATTERNS,
      }),
    ).toBe('2026年');

    expect(
      formatReportMobilePeriod({
        granularity: 'year',
        periodStart: new Date(2026, 0, 1),
        periodEnd: new Date(2026, 11, 31),
        dateFnsLocale: enUS,
        patterns: EN_PATTERNS,
      }),
    ).toBe('2026');
  });
});
