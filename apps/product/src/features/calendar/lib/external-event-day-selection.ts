/**
 * 表示範囲分の ghost から、1 日カラムに出すものを選ぶ。
 *
 * 日跨ぎの予定は開始日〜終了日のすべての日に出す（`useTimeblocksByDate` の multi-day 配布と
 * 同じ判定）。**`date`（カラム）と `event.startDate`/`endDate`（外部予定）は別の空間**:
 * `date` は `useDateUtilities` が `date-fns` のローカルフィールド演算（`startOfWeek` /
 * `addDays`）で作る壁時計 Date で、既にその日を表している。一方 `event.startDate`/`endDate` は
 * provider から来た生の UTC instant。両方に `timezone` 付きの `getDateKey` を掛けると、`date`
 * 側が instant として再解釈され、ブラウザ TZ ≠ ユーザー設定 TZ の時に日付がずれる
 * （`formatInTimeZone` は常に instant → TZ 変換なので、既にローカル日を表す値に掛けると二重変換
 * になる）。カラム側は `timezone` を渡さず（ローカルフィールド読み取り）、instant 側だけ変換する。
 */

import { getDateKey } from '@/lib/date';

interface DayScopedEvent {
  id: string;
  startDate: Date;
  endDate: Date;
}

export function selectExternalEventsForDate<T extends DayScopedEvent>(
  events: ReadonlyArray<T>,
  date: Date,
  timezone: string,
): T[] {
  const dateKey = getDateKey(date);

  return events.filter((event) => {
    const startKey = getDateKey(event.startDate, timezone);
    const endKey = getDateKey(event.endDate, timezone);
    return startKey <= dateKey && dateKey <= endKey;
  });
}
