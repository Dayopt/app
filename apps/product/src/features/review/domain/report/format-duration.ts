/**
 * レポートの時間表記。
 *
 * `h:mm` 形式で、時はゼロ埋めしない（`0:45` / `14:00` / `92:40`）。時間が 3 桁になっても
 * そのまま伸ばす（週の分母は 168 時間で、年粒度なら 4 桁もありうる）。
 *
 * `lib/date/duration.ts` の `formatDurationMinutes` は `1h 30m` 形式で、レポートの
 * 決算表示では桁が揃わず読みづらいため別に持つ。
 */
export function formatReportDuration(totalMinutes: number): string {
  const totalWholeMinutes = Math.round(Math.abs(totalMinutes));
  const hours = Math.floor(totalWholeMinutes / 60);
  const minutes = totalWholeMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

/** 符号付きの時間表記（前期間との差）。0 は `+0:00` ではなく `0:00`。 */
export function formatReportDelta(deltaMinutes: number): string {
  const whole = Math.round(deltaMinutes);
  const body = formatReportDuration(whole);
  if (whole > 0) return `+${body}`;
  if (whole < 0) return `−${body}`;
  return body;
}
