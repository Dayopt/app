import { describe, expect, it } from 'vitest';

import { isValidCalendarViewToken } from '@/lib/calendar-view-tokens';

import { parseCalendarViewParam, parseMultiDayViewParam } from './calendar-page-params';

describe('parseMultiDayViewParam', () => {
  it.each(['2day', '3day', '7day'])('%sをmulti-day viewとして受理する', (value) => {
    expect(parseMultiDayViewParam(value)).toBe(value);
  });

  it.each(['1day', '8day', '9day', '10day', 'week', '3days'])('%sを拒否する', (value) => {
    expect(parseMultiDayViewParam(value)).toBeNull();
  });
});

// parseCalendarViewParam / CalendarNavigationContext.tsx の isValidViewType /
// proxy.ts はいずれも @/lib/calendar-view-tokens の isValidCalendarViewToken を単一定義
// として使う（旧実装は3箇所に判定ロジックを複製していた。
// `.claude/rules/workflow.md` §同型指摘の打ち切り に従い統一）。
describe('@/lib/calendar-view-tokens と parseCalendarViewParam の整合性', () => {
  it.each(['day', 'week', '2day', '3day', '4day', '5day', '6day', '7day'])(
    '%s は両者とも受理する',
    (value) => {
      expect(isValidCalendarViewToken(value)).toBe(true);
      expect(parseCalendarViewParam(value)).not.toBeNull();
    },
  );

  it.each(['1day', '8day', '9day', '10day', '0day', '', 'stats', '3days', 'DAY'])(
    '%s は両者とも拒否する',
    (value) => {
      expect(isValidCalendarViewToken(value)).toBe(false);
      expect(parseCalendarViewParam(value)).toBeNull();
    },
  );

  // risk-reviewer が「JS の $ は末尾改行を許容する（Perl/PCRE 由来の記憶）」との仮説で
  // 指摘したが、JS の $ は /m フラグ無しでは文字列末尾を厳密に指し、末尾改行を許容しない
  // （2026-08-19、node -e で実測して反証済み）。両者とも正しく拒否することを固定する。
  it("'2day\\n' は両者とも拒否する（JSのregex \\$ は末尾改行を許容しないため元から安全）", () => {
    expect(parseCalendarViewParam('2day\n')).toBeNull();
    expect(isValidCalendarViewToken('2day\n')).toBe(false);
  });
});
