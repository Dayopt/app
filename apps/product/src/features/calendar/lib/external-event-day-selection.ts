/**
 * 表示範囲分の ghost から、1 日カラムに出すものを選ぶ。
 *
 * 日跨ぎの予定は開始日〜終了日のすべての日に出す（`useTimeblocksByDate` の multi-day 配布と
 * 同じ判定）。日境界の判定は必ずユーザー TZ の `getDateKey` を通す — ブラウザ TZ で判定すると、
 * TZ 設定を変えているユーザーで 1 日ずれる。
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
  const dateKey = getDateKey(date, timezone);

  return events.filter((event) => {
    const startKey = getDateKey(event.startDate, timezone);
    const endKey = getDateKey(event.endDate, timezone);
    return startKey <= dateKey && dateKey <= endKey;
  });
}
