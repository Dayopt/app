/**
 * 時間数を人間が読みやすい形式にフォーマット
 *
 * 1h 未満 → "42m", 1h 以上 → "3.5h"
 */
export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(1)}h`;
}
