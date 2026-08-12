import { describe, expect, it } from 'vitest';

import { selectExternalEventsForDate } from '../external-event-day-selection';

const TOKYO = 'Asia/Tokyo';

function event(id: string, startIso: string, endIso: string) {
  return { id, startDate: new Date(startIso), endDate: new Date(endIso) };
}

/**
 * `date`（カラム）は `useDateUtilities` が `date-fns` のローカルフィールド演算で作る壁時計
 * Date を想定する。`selectExternalEventsForDate` はこれを `timezone` 抜きの `getDateKey`
 * （実行環境のローカル TZ 依存のフィールド読み取り）で扱うため、テストでは UTC ISO 文字列では
 * なくローカルコンポーネント指定の `new Date(y, m, d)` で構築する
 * （実行環境の TZ に関わらず意図した日付を再現するため。`two-lane-layout.test.ts` と同じ理由）。
 */
function localDay(day: number): Date {
  return new Date(2026, 7, day);
}

/** 2026-08-11 のカラム。 */
const TARGET_DAY = localDay(11);

describe('selectExternalEventsForDate', () => {
  it('その日に始まって終わる予定を選ぶ', () => {
    const events = [event('a', '2026-08-11T01:00:00.000Z', '2026-08-11T02:00:00.000Z')];

    expect(selectExternalEventsForDate(events, TARGET_DAY, TOKYO).map((e) => e.id)).toEqual(['a']);
  });

  it('別の日の予定は選ばない', () => {
    const events = [
      event('before', '2026-08-09T01:00:00.000Z', '2026-08-09T02:00:00.000Z'),
      event('after', '2026-08-13T01:00:00.000Z', '2026-08-13T02:00:00.000Z'),
    ];

    expect(selectExternalEventsForDate(events, TARGET_DAY, TOKYO)).toEqual([]);
  });

  it('日を跨ぐ予定は開始日にも終了日にも出す', () => {
    // Tokyo で 8/10 23:00 → 8/11 01:00
    const spanning = event('spanning', '2026-08-10T14:00:00.000Z', '2026-08-10T16:00:00.000Z');
    const previousDay = localDay(10);

    expect(selectExternalEventsForDate([spanning], previousDay, TOKYO).map((e) => e.id)).toEqual([
      'spanning',
    ]);
    expect(selectExternalEventsForDate([spanning], TARGET_DAY, TOKYO).map((e) => e.id)).toEqual([
      'spanning',
    ]);
  });

  it('複数日にまたがる予定は中日にも出す', () => {
    const events = [event('long', '2026-08-09T12:00:00.000Z', '2026-08-13T12:00:00.000Z')];

    expect(selectExternalEventsForDate(events, TARGET_DAY, TOKYO).map((e) => e.id)).toEqual([
      'long',
    ]);
  });

  it('日境界の判定は予定側だけユーザー TZ で行う（カラム側は固定）', () => {
    // UTC で 8/11 20:00 は Tokyo では 8/12 05:00。Tokyo のユーザーには翌日の予定として出る。
    const events = [event('late', '2026-08-11T20:00:00.000Z', '2026-08-11T21:00:00.000Z')];

    expect(selectExternalEventsForDate(events, TARGET_DAY, TOKYO)).toEqual([]);
    expect(selectExternalEventsForDate(events, TARGET_DAY, 'UTC').map((e) => e.id)).toEqual([
      'late',
    ]);
  });
});
