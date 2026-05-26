/**
 * 曜日別の活動分布を月曜始まりの 7 日配列に集約する pure aggregation。
 *
 * Server 層 (`features/entry/server/statistics.ts`) の `getDayOfWeekDistribution`
 * から DB 非依存の純粋な集計だけを切り出している。
 */

export interface DayOfWeekRow {
  /** 0=日, 1=月, ..., 6=土 (Postgres `EXTRACT(DOW FROM ...)` の慣習) */
  dow: number;
  total_minutes: number;
}

export interface DayOfWeekSlot {
  /** 日本語 1 文字の曜日名 ('月', '火', ...) */
  day: string;
  /** その曜日の合計時間（時間単位） */
  hours: number;
}

const DAY_NAMES_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;
const MONDAY_FIRST_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/**
 * RPC 行配列を 7 日バッファ → 月曜始まりの曜日 slot 配列に変換する。
 *
 * `dow` が `[0, 7)` の範囲外の row は無視する。
 */
export function aggregateDayOfWeekDistribution(rows: ReadonlyArray<DayOfWeekRow>): DayOfWeekSlot[] {
  const dayHours: number[] = new Array(7).fill(0);
  for (const row of rows) {
    if (row.dow >= 0 && row.dow < 7) {
      dayHours[row.dow] = row.total_minutes / 60;
    }
  }

  return MONDAY_FIRST_ORDER.map((dayIndex) => ({
    day: DAY_NAMES_JA[dayIndex] ?? '',
    hours: dayHours[dayIndex] ?? 0,
  }));
}
