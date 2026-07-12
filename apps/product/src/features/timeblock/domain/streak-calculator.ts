/**
 * 連続アクティブ日数（streak）の pure 計算ロジック。
 *
 * Server 層 (`features/timeblock/server/statistics.ts`) の `getStreak` から
 * DB 非依存の純粋な集計だけを切り出している。
 */

import { formatInTimeZone } from 'date-fns-tz';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_LOOKBACK_DAYS = 365;

interface StreakInput {
  /** "YYYY-MM-DD" 形式の active 日付配列（DB から取得済み） */
  activeDates: ReadonlyArray<string>;
  /** ユーザー TZ における今日の "YYYY-MM-DD" */
  todayStr: string;
  /** ユーザーの IANA timezone（例: "Asia/Tokyo"） */
  timezone: string;
}

/**
 * 今日から逆順に最大 365 日まで遡り、`activeDates` に連続して含まれる日数を数える。
 *
 * 途中で 1 日でも欠けたら break する（streak の定義）。
 */
export function calculateStreak({ activeDates, todayStr, timezone }: StreakInput): number {
  const dateSet = new Set(activeDates);
  const todayMs = new Date(`${todayStr}T00:00:00Z`).getTime();

  let streak = 0;
  for (let i = 0; i < MAX_LOOKBACK_DAYS; i++) {
    const d = new Date(todayMs - i * MS_PER_DAY);
    const dateStr = formatInTimeZone(d, timezone, 'yyyy-MM-dd');
    if (dateSet.has(dateStr)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}
