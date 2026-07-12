/**
 * 月別トレンド集計の pure logic。
 *
 * Server 層 (`features/timeblock/server/statistics.ts`) の `getMonthlyTrend` から
 * DB 非依存の純粋な date math と aggregation だけを切り出している。
 *
 * TZ 形式化は procedure 側で行い、ここには `nowYear` / `nowMonth` 既に確定値を
 * 受け取る前提（domain 層は TZ 非依存）。
 */

interface MonthlyTrendRow {
  /** "YYYY-MM" 形式の月キー */
  month: string;
  hours: number;
}

interface MonthTrendSlot {
  /** "YYYY-MM" 形式の月キー */
  month: string;
  /** 月の数値部分（leading zero なし）。"2026-05" → "5" / "2026-12" → "12" */
  label: string;
  hours: number;
}

/**
 * `nowYear`/`nowMonth` を「現在月」とし、そこから `monthCount - 1` 月前の 1 日 (UTC) を返す。
 *
 * JavaScript の `Date.UTC` は month が負数のとき自動で year を roll-back するため、
 * `Date.UTC(2026, -7, 1)` は `2025-06-01T00:00:00Z` になる。
 *
 * RPC `get_monthly_hours` の `p_start_date` 引数として使われる。
 */
export function getMonthlyStartDate(nowYear: number, nowMonth: number, monthCount: number): Date {
  return new Date(Date.UTC(nowYear, nowMonth - 1 - (monthCount - 1), 1));
}

/**
 * `monthCount` 個の "YYYY-MM" キーを生成し、`rows` の hours を overlay して
 * 月昇順の slot 配列を返す。未知 month の row は無視される。
 *
 * 負数 modulo の補正で年跨ぎ・leap year 期間も正しく処理する。
 */
export function aggregateMonthlyTrend(
  rows: ReadonlyArray<MonthlyTrendRow>,
  nowYear: number,
  nowMonth: number,
  monthCount: number,
): MonthTrendSlot[] {
  const monthlyHours: Record<string, number> = {};
  for (let i = 0; i < monthCount; i++) {
    const offset = nowMonth - 1 - (monthCount - 1) + i;
    const year = nowYear + Math.floor(offset / 12);
    const month = (((offset % 12) + 12) % 12) + 1;
    const key = `${year}-${month.toString().padStart(2, '0')}`;
    monthlyHours[key] = 0;
  }
  for (const row of rows) {
    if (monthlyHours[row.month] !== undefined) {
      monthlyHours[row.month] = row.hours;
    }
  }

  return Object.entries(monthlyHours)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, hours]) => {
      const monthPart = month.split('-')[1];
      return { month, label: `${monthPart ? parseInt(monthPart) : 0}`, hours };
    });
}
