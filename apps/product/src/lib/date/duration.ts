/**
 * 期間フォーマットユーティリティ
 *
 * 分単位の期間を "Xh Ym" 形式に整形する。
 * 日付・時刻の表示は user 設定対応の `@/lib/hooks/useDateFormat`、
 * "HH:mm" 整形は `./timeString`、タイムゾーン変換は `./timezone` を使う。
 *
 * @example
 * ```typescript
 * import { formatDurationMinutes } from '@/lib/date';
 *
 * formatDurationMinutes(90); // "1h 30m"
 * formatDurationMinutes(45); // "45m"
 * ```
 */

/**
 * 期間（分）を簡潔にフォーマット
 *
 * @example
 * ```typescript
 * formatDurationMinutes(90); // "1h 30m"
 * formatDurationMinutes(45); // "45m"
 * ```
 */
export function formatDurationMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
