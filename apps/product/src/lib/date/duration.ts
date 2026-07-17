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
 * 分単位の集計値は小数（例: 秒精度の合計を丸めた 0.1 分刻み）になりうるため、
 * 表示直前に丸める。符号は無視する（符号付き表示は呼び出し側で組み立てる）。
 *
 * @example
 * ```typescript
 * formatDurationMinutes(90); // "1h 30m"
 * formatDurationMinutes(45); // "45m"
 * formatDurationMinutes(90.5); // "1h 31m"
 * ```
 */
export function formatDurationMinutes(totalMinutes: number): string {
  const abs = Math.abs(totalMinutes);
  if (abs >= 60) {
    const hours = Math.floor(abs / 60);
    const minutes = Math.round(abs % 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${Math.round(abs)}m`;
}
