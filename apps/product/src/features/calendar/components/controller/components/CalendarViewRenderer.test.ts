import { describe, expect, it } from 'vitest';

import { resolveMultiDayColumnCount } from './CalendarViewRenderer';

describe('resolveMultiDayColumnCount', () => {
  it('タブレット以上では7日指定を5日に縮めない', () => {
    expect(resolveMultiDayColumnCount(7, false)).toBe(7);
  });

  it('モバイルでは最大3日に制限する', () => {
    expect(resolveMultiDayColumnCount(7, true)).toBe(3);
  });
});
