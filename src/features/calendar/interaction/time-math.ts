/**
 * 時刻 ↔ ピクセル変換の唯一のソース
 *
 * React/DOM 依存ゼロ。DnDProvider / machine.ts / useDragSelection が共通利用。
 * テスト: time-math.test.ts
 */

export const DEFAULT_SNAP_INTERVAL = 15;

/** Y座標 → 時刻（スナップあり） */
export function pixelsToTime(
  yPx: number,
  hourHeight: number,
  snapInterval: number = DEFAULT_SNAP_INTERVAL,
): { hour: number; minute: number } {
  const clampedY = Math.max(0, yPx);
  const hourDecimal = clampedY / hourHeight;
  let hour = Math.floor(Math.min(23, hourDecimal));
  const minuteFraction = (hourDecimal - hour) * 60;
  let minute = Math.round(minuteFraction / snapInterval) * snapInterval;

  if (minute >= 60) {
    minute = 0;
    hour = Math.min(23, hour + 1);
  }

  return { hour, minute };
}

/** 時刻 → Y座標 */
export function timeToPixels(hour: number, minute: number, hourHeight: number): number {
  return (hour + minute / 60) * hourHeight;
}

/** pixelsToTime + timeToPixels を一度にやる（interaction machine 用） */
export function snapToGrid(
  yPx: number,
  hourHeight: number,
  intervalMin: number = DEFAULT_SNAP_INTERVAL,
): { snappedTop: number; hour: number; minute: number } {
  const { hour, minute } = pixelsToTime(yPx, hourHeight, intervalMin);
  const snappedTop = timeToPixels(hour, minute, hourHeight);
  return { snappedTop, hour, minute };
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

/** "HH:mm" パース */
export function parseTimeString(time: string): { hour: number; minute: number } | null {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = parseInt(match[1]!, 10);
  const minute = parseInt(match[2]!, 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** 時刻 + duration → 終了時刻 */
export function addMinutesToTime(
  hour: number,
  minute: number,
  durationMinutes: number,
): { hour: number; minute: number } {
  const totalMinutes = hour * 60 + minute + durationMinutes;
  const endHour = Math.floor(totalMinutes / 60) % 24;
  const endMinute = totalMinutes % 60;
  return { hour: endHour, minute: endMinute };
}
