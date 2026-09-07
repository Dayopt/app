import { describe, expect, it } from 'vitest';

import { distributeToTimeOfDay, REPORT_TIME_OF_DAY_BUCKETS } from './report-period';

const TOKYO = 'Asia/Tokyo';

/** バケット名 → index（配列順に依存した assert を書かないため）。 */
const INDEX = Object.fromEntries(
  REPORT_TIME_OF_DAY_BUCKETS.map((bucket, index) => [bucket.key, index]),
) as Record<(typeof REPORT_TIME_OF_DAY_BUCKETS)[number]['key'], number>;

/** JST の壁時計時刻を UTC ISO へ。 */
function jst(day: string, time: string): string {
  const [hour, minute] = time.split(':').map(Number);
  const utcHour = (hour ?? 0) - 9;
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCHours(utcHour, minute ?? 0, 0, 0);
  return date.toISOString();
}

describe('distributeToTimeOfDay', () => {
  it('1 つのバケットに収まる記録はそこへ全部入る', () => {
    const totals = distributeToTimeOfDay(
      jst('2026-09-02', '10:00'),
      jst('2026-09-02', '11:30'),
      TOKYO,
    );

    expect(totals[INDEX.lateMorning]).toBe(90);
    expect(totals.reduce((sum, value) => sum + value, 0)).toBe(90);
  });

  /** 仕様 §6-4。バケット境界（12:00）を跨ぐ記録は按分され、片方へ寄らない。 */
  it('バケットを跨ぐ記録を按分する', () => {
    const totals = distributeToTimeOfDay(
      jst('2026-09-02', '11:00'),
      jst('2026-09-02', '13:00'),
      TOKYO,
    );

    expect(totals[INDEX.lateMorning]).toBe(60);
    expect(totals[INDEX.midday]).toBe(60);
  });

  /** 0 時またぎは日境界で分割してから按分する（夜 → 深夜）。 */
  it('0 時をまたぐ記録を夜と深夜へ分ける', () => {
    const totals = distributeToTimeOfDay(
      jst('2026-09-02', '23:30'),
      jst('2026-09-03', '01:00'),
      TOKYO,
    );

    expect(totals[INDEX.evening]).toBe(30);
    expect(totals[INDEX.night]).toBe(60);
    expect(totals.reduce((sum, value) => sum + value, 0)).toBe(90);
  });

  /** timezone で切る。UTC のまま切ると JST 早朝の記録が前日の夜へ落ちる。 */
  it('ユーザーの timezone の壁時計で位置を決める', () => {
    // JST 06:00–07:00（UTC では前日 21:00–22:00）
    const totals = distributeToTimeOfDay(
      jst('2026-09-02', '06:00'),
      jst('2026-09-02', '07:00'),
      TOKYO,
    );

    expect(totals[INDEX.morning]).toBe(60);
    expect(totals[INDEX.evening]).toBe(0);
  });

  it('複数日にまたがる記録も日ごとに分けて按分する', () => {
    const totals = distributeToTimeOfDay(
      jst('2026-09-02', '22:00'),
      jst('2026-09-04', '02:00'),
      TOKYO,
    );

    // 2 日ぶんの深夜（各 300 分）+ 初日の夜 120 分 + 中日の各バケット
    expect(totals[INDEX.night]).toBe(300 + 120);
    expect(totals.reduce((sum, value) => sum + value, 0)).toBe(28 * 60);
  });

  it('長さ 0 と逆転した区間は 0 を返す', () => {
    const same = distributeToTimeOfDay(
      jst('2026-09-02', '10:00'),
      jst('2026-09-02', '10:00'),
      TOKYO,
    );
    const reversed = distributeToTimeOfDay(
      jst('2026-09-02', '11:00'),
      jst('2026-09-02', '10:00'),
      TOKYO,
    );

    expect(same.every((value) => value === 0)).toBe(true);
    expect(reversed.every((value) => value === 0)).toBe(true);
  });
});
