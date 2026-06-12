/**
 * 時間ユーティリティ
 *
 * HH:MM 形式の時刻文字列に対する共通操作
 */

/**
 * 開始時刻と終了時刻（HH:MM）から所要時間（分）を算出
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

/**
 * 所要時間（分）を "Xh Ym" 形式にフォーマット
 *
 * @returns 0以下の場合は空文字
 */
export function formatDurationDisplay(minutes: number): string {
  if (minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
