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

/** 時刻フォーマット（24h: "14:30" / 12h: "2:30 PM"） */
export function formatTimeString(
  hour: number,
  minute: number,
  format: '24h' | '12h' = '24h',
): string {
  if (format === '12h') {
    const period = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${h12}:${String(minute).padStart(2, '0')} ${period}`;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * 開始時刻と終了時刻（"HH:mm"）から所要時間（分）を算出。
 *
 * @returns 正の分数。無効な入力や負の差分は 0 を返す
 */
export function computeDuration(start: string, end: string): number {
  if (!start || !end) return 0;
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  if (isNaN(startH!) || isNaN(startM!) || isNaN(endH!) || isNaN(endM!)) return 0;
  const startMinutes = startH! * 60 + startM!;
  const endMinutes = endH! * 60 + endM!;
  const duration = endMinutes - startMinutes;
  return duration > 0 ? duration : 0;
}
