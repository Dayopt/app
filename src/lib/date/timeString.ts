/**
 * 時刻文字列ユーティリティ
 *
 * `HH:mm` 形式の string ↔ {hour, minute} 変換。React/DOM 依存ゼロ。
 * calendar interaction layer と entry inspector の両方から参照される。
 */

/** "HH:mm" を `{hour, minute}` にパース。範囲外・フォーマット不一致は null。 */
export function parseTimeString(time: string): { hour: number; minute: number } | null {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = parseInt(match[1]!, 10);
  const minute = parseInt(match[2]!, 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** `{hour, minute}` を 0 padding した `HH:mm` 文字列に整形。 */
export function formatHHmm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
