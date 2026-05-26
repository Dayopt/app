/**
 * 時間帯別の活動分布を 2 時間 slot に集約する pure aggregation。
 *
 * Server 層 (`features/entry/server/statistics.ts`) の `getHourlyDistribution`
 * から DB 非依存の純粋な集計だけを切り出している。
 */

export interface HourlyDistributionRow {
  hour: number;
  total_minutes: number;
}

export interface HourlySlot {
  /** "HH:00" 形式の slot 先頭時刻 */
  timeSlot: string;
  /** その 2h slot 合計時間（時間単位、分 → 時換算済み） */
  hours: number;
}

/**
 * RPC 行配列を 24h バッファ → 2h slot 集約結果に変換する。
 *
 * `hour` が `[0, 24)` の範囲外の row は無視する。
 */
export function aggregateHourlyDistribution(
  rows: ReadonlyArray<HourlyDistributionRow>,
): HourlySlot[] {
  const hourlyHours: number[] = new Array(24).fill(0);
  for (const row of rows) {
    if (row.hour >= 0 && row.hour < 24) {
      hourlyHours[row.hour] = row.total_minutes / 60;
    }
  }

  const timeSlots: HourlySlot[] = [];
  for (let i = 0; i < 24; i += 2) {
    const hourA = hourlyHours[i] ?? 0;
    const hourB = hourlyHours[i + 1] ?? 0;
    timeSlots.push({
      timeSlot: `${i.toString().padStart(2, '0')}:00`,
      hours: hourA + hourB,
    });
  }
  return timeSlots;
}
