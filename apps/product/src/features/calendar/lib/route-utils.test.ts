import { describe, expect, it } from 'vitest';

import { isCalendarViewPath, resolveWorkspaceTab } from './route-utils';

describe('isCalendarViewPath', () => {
  describe('正常系', () => {
    it('/calendar（新URL契約、完全一致）→ true', () => {
      expect(isCalendarViewPath('/calendar')).toBe(true);
    });

    it('/calendar?view=week のようにクエリが付いていても true', () => {
      expect(isCalendarViewPath('/calendar?view=week')).toBe(true);
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

    // 旧 /day /week /Nday は proxy.ts の redirect で /calendar へ集約済み
    // （epic #2181 Step 6、#2195）。この関数はアプリ内部の pathname のみを見るため
    // redirect 前提の旧パスは false になる（redirect の契約自体は proxy.test.ts が担保する）。
    it('旧 day/week/Nday パスは false（proxy の redirect が担保する。この関数の対象外）', () => {
      expect(isCalendarViewPath('/day')).toBe(false);
      expect(isCalendarViewPath('/week')).toBe(false);
      expect(isCalendarViewPath('/3day')).toBe(false);
    });
  });
});

describe('resolveWorkspaceTab', () => {
  it('/calendar → calendar', () => {
    expect(resolveWorkspaceTab('/calendar')).toBe('calendar');
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
