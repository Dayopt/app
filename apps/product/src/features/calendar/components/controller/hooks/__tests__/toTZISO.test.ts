import { describe, expect, it } from 'vitest';

import { toTZEndISO, toTZStartISO } from '../useCalendarData';

/**
 * `date` は `calculateViewDateRange` が作るローカル壁時計 Date（実行環境の system TZ で
 * 2026-08-11 を表す）。`toTZStartISO`/`toTZEndISO` は system TZ に関わらずこの「日付」を
 * そのまま使うべきで、出力は指定した `timezone` の 2026-08-11 境界に固定される。
 *
 * 回帰: 旧実装は `Intl.DateTimeFormat({ timeZone: timezone })` で `date` を instant として
 * `timezone` へ再解釈していたため、実行環境の system TZ と `timezone` が食い違うと日付が
 * ずれた（ブラウザ TZ ≠ ユーザー設定 TZ で発生する、この PR の Codex round 3 指摘）。
 */
const LOCAL_AUG_11 = new Date(2026, 7, 11, 0, 0, 0, 0);

describe('toTZStartISO / toTZEndISO', () => {
  it('Asia/Tokyo（UTC+9、DST 無し）の日境界を返す', () => {
    expect(toTZStartISO(LOCAL_AUG_11, 'Asia/Tokyo')).toBe('2026-08-10T15:00:00.000Z');
    expect(toTZEndISO(LOCAL_AUG_11, 'Asia/Tokyo')).toBe('2026-08-11T14:59:59.999Z');
  });

  it('America/Los_Angeles（8月は UTC-7、PDT）の日境界を返す', () => {
    expect(toTZStartISO(LOCAL_AUG_11, 'America/Los_Angeles')).toBe('2026-08-11T07:00:00.000Z');
    expect(toTZEndISO(LOCAL_AUG_11, 'America/Los_Angeles')).toBe('2026-08-12T06:59:59.999Z');
  });

  it('timezone を変えても対象の暦日（2026-08-11）自体は変わらない', () => {
    // どちらも「2026-08-11 のその TZ での 00:00」を指す UTC instant であることを、
    // 各 TZ でフォーマットし直して確認する。
    const tokyoStart = new Date(toTZStartISO(LOCAL_AUG_11, 'Asia/Tokyo'));
    const laStart = new Date(toTZStartISO(LOCAL_AUG_11, 'America/Los_Angeles'));

    expect(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(tokyoStart)).toBe(
      '2026-08-11',
    );
    expect(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(laStart),
    ).toBe('2026-08-11');
  });
});
