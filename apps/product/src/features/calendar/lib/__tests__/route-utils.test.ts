import { describe, expect, it } from 'vitest';

import { isCalendarViewPath, resolveWorkspaceTab } from '../route-utils';

describe('isCalendarViewPath', () => {
  describe('正常系', () => {
    it('/calendar（新URL契約、完全一致）→ true', () => {
      expect(isCalendarViewPath('/calendar')).toBe(true);
    });

    it('/calendar?view=week のようにクエリが付いていても true', () => {
      expect(isCalendarViewPath('/calendar?view=week')).toBe(true);
    });

    it('/day → true', () => {
      expect(isCalendarViewPath('/day')).toBe(true);
    });

    it('/week → true', () => {
      expect(isCalendarViewPath('/week')).toBe(true);
    });

    it.each(['2day', '3day', '5day', '7day'])('/%s（multi-day view）→ true', (segment) => {
      expect(isCalendarViewPath(`/${segment}`)).toBe(true);
    });

    it('クエリ文字列が付いていても判定できる', () => {
      expect(isCalendarViewPath('/week?date=2026-01-01')).toBe(true);
      expect(isCalendarViewPath('/3day?foo=bar')).toBe(true);
    });
  });

  describe('false 判定', () => {
    it('ルート直下（セグメントなし）→ false', () => {
      expect(isCalendarViewPath('')).toBe(false);
      expect(isCalendarViewPath('/')).toBe(false);
    });

    it('未対応セグメントは false', () => {
      expect(isCalendarViewPath('/month')).toBe(false);
      expect(isCalendarViewPath('/year')).toBe(false);
    });

    it('workspace ビュー以外のパスは false', () => {
      expect(isCalendarViewPath('/review')).toBe(false);
      expect(isCalendarViewPath('/settings')).toBe(false);
      expect(isCalendarViewPath('/tags')).toBe(false);
    });

    it('旧 calendar namespace のサブパスは false（先頭セグメントが calendar でも完全一致でなければ false）', () => {
      expect(isCalendarViewPath('/calendar/day')).toBe(false);
      expect(isCalendarViewPath('/api/calendar/day')).toBe(false);
    });

    it('数字以外を含む day-like セグメント → false', () => {
      // 3day-archive / dayweek / day2 のような誤マッチを防ぐ
      expect(isCalendarViewPath('/3day-archive')).toBe(false);
      expect(isCalendarViewPath('/dayweek')).toBe(false);
      expect(isCalendarViewPath('/day2')).toBe(false);
      expect(isCalendarViewPath('/8day')).toBe(false);
      expect(isCalendarViewPath('/9day')).toBe(false);
    });

    it('day 単位のみで数字なしは false', () => {
      expect(isCalendarViewPath('/day-')).toBe(false);
    });
  });
});

describe('resolveWorkspaceTab', () => {
  it.each(['/calendar', '/day', '/week', '/2day', '/7day'])('%s → calendar', (path) => {
    expect(resolveWorkspaceTab(path)).toBe('calendar');
  });

  it('/report → report', () => {
    expect(resolveWorkspaceTab('/report')).toBe('report');
  });

  it('/report/anything は report タブではない（完全一致のみ）', () => {
    expect(resolveWorkspaceTab('/report/anything')).toBe('other');
  });

  it.each(['/settings', '/tags', '/'])('%s → other（第3のタブは作らない）', (path) => {
    expect(resolveWorkspaceTab(path)).toBe('other');
  });
});
