import { describe, expect, it } from 'vitest';

import { VALID_CALENDAR_VIEW_TOKENS } from '@/proxy';

import { parseCalendarViewParam, parseMultiDayViewParam } from '../calendar-page-params';

describe('parseMultiDayViewParam', () => {
  it.each(['2day', '3day', '7day'])('%sをmulti-day viewとして受理する', (value) => {
    expect(parseMultiDayViewParam(value)).toBe(value);
  });

  it.each(['1day', '8day', '9day', '10day', 'week', '3days'])('%sを拒否する', (value) => {
    expect(parseMultiDayViewParam(value)).toBeNull();
  });
});

// proxy.ts の VALID_CALENDAR_VIEW_TOKENS は edge runtime 制約（next-intl/server 等
// node 依存を持つこのファイルを import できない）のため定数を複製している。
// この test が両者の drift を検出する（片方だけ値域を変えると red になる）。
describe('proxy.ts の VALID_CALENDAR_VIEW_TOKENS と parseCalendarViewParam の整合性', () => {
  it.each(['day', 'week', '2day', '3day', '4day', '5day', '6day', '7day'])(
    '%s は両者とも受理する',
    (value) => {
      expect(VALID_CALENDAR_VIEW_TOKENS.has(value)).toBe(true);
      expect(parseCalendarViewParam(value)).not.toBeNull();
    },
  );

  it.each(['1day', '8day', '9day', '10day', '0day', '', 'stats', '3days', 'DAY'])(
    '%s は両者とも拒否する',
    (value) => {
      expect(VALID_CALENDAR_VIEW_TOKENS.has(value)).toBe(false);
      expect(parseCalendarViewParam(value)).toBeNull();
    },
  );

  // risk-reviewer が「JS の $ は末尾改行を許容する（Perl/PCRE 由来の記憶）」との仮説で
  // 指摘したが、JS の $ は /m フラグ無しでは文字列末尾を厳密に指し、末尾改行を許容しない
  // （2026-08-19、node -e で実測して反証済み）。両者とも正しく拒否することを固定する。
  it("'2day\\n' は両者とも拒否する（JSのregex \\$ は末尾改行を許容しないため元から安全）", () => {
    expect(parseCalendarViewParam('2day\n')).toBeNull();
    expect(VALID_CALENDAR_VIEW_TOKENS.has('2day\n')).toBe(false);
  });
});
