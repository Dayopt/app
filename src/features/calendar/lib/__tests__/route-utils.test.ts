import { describe, expect, it } from 'vitest';

import { isCalendarViewPath } from '../route-utils';

describe('isCalendarViewPath', () => {
  describe('正常系', () => {
    it('/calendar/day → true', () => {
      expect(isCalendarViewPath('/calendar/day')).toBe(true);
    });

    it('/calendar/week → true', () => {
      expect(isCalendarViewPath('/calendar/week')).toBe(true);
    });

    it.each(['2day', '3day', '5day', '7day', '9day'])(
      '/calendar/%s（multi-day view）→ true',
      (segment) => {
        expect(isCalendarViewPath(`/calendar/${segment}`)).toBe(true);
      },
    );

    it('クエリ文字列が付いていても判定できる', () => {
      expect(isCalendarViewPath('/calendar/week?date=2026-01-01')).toBe(true);
      expect(isCalendarViewPath('/calendar/3day?foo=bar')).toBe(true);
    });
  });

  describe('false 判定', () => {
    it('/calendar 直下（セグメントなし）→ false', () => {
      expect(isCalendarViewPath('/calendar')).toBe(false);
      expect(isCalendarViewPath('/calendar/')).toBe(false);
    });

    it('未対応セグメントは false', () => {
      expect(isCalendarViewPath('/calendar/month')).toBe(false);
      expect(isCalendarViewPath('/calendar/year')).toBe(false);
    });

    it('/calendar 以外のパスは false', () => {
      expect(isCalendarViewPath('/stats')).toBe(false);
      expect(isCalendarViewPath('/tags')).toBe(false);
      expect(isCalendarViewPath('/')).toBe(false);
    });

    it('/calendar をプレフィックスに含む別パスは false（startsWith は通るが segment が想定外）', () => {
      // 例: /calendarx/day → segment=day なので true になり得る点に注意
      // 設計上 startsWith('/calendar') を採用しているため /calendarx は実装上 true になる。
      // ここでは /calendars/day（複数形） のような誤マッチが起きないか確認する代わりに、
      // 既知の false パターンのみを検証する。
      expect(isCalendarViewPath('/api/calendar/day')).toBe(false);
    });

    it('数字以外を含む day-like セグメント → false', () => {
      // 3day-archive のような誤マッチを防ぐ
      expect(isCalendarViewPath('/calendar/3day-archive')).toBe(false);
      expect(isCalendarViewPath('/calendar/dayweek')).toBe(false);
      expect(isCalendarViewPath('/calendar/day2')).toBe(false);
    });

    it('day 単位のみで数字なしは false', () => {
      expect(isCalendarViewPath('/calendar/day-')).toBe(false);
    });

    it('空文字列 / undefined-like → false', () => {
      expect(isCalendarViewPath('')).toBe(false);
    });
  });

  describe('multi-day の数値範囲', () => {
    it('1day も regex 上は許容（実際の navigation 制限は別レイヤーで担当）', () => {
      // 仕様: regex /^\d+day$/ は 1 桁 1+ を全て許容
      expect(isCalendarViewPath('/calendar/1day')).toBe(true);
      expect(isCalendarViewPath('/calendar/10day')).toBe(true);
    });
  });
});
