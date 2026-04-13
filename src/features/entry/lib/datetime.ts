/**
 * 日付と時刻文字列をローカルタイムゾーンのISO 8601形式に変換
 *
 * @param dateStr - 日付文字列（YYYY-MM-DD）
 * @param timeStr - 時刻文字列（HH:mm）
 * @returns ISO 8601形式のタイムスタンプ（ローカルタイムゾーン）
 *
 * @example
 * ```typescript
 * // 日本時間（JST = UTC+9）で実行
 * toLocalISOString('2025-11-23', '13:15')
 * // => '2025-11-23T13:15:00+09:00'
 *
 * // これをSupabaseに保存すると、自動的にUTC（04:15:00Z）に変換される
 * ```
 */
export function toLocalISOString(dateStr: string, timeStr: string): string {
  // 日付と時刻をパース
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);

  // ローカルタイムゾーンでDateオブジェクトを作成
  const date = new Date(year!, month! - 1, day!, hour!, minute!, 0, 0);

  // ISO 8601形式に変換（ローカルタイムゾーンのオフセット付き）
  return date.toISOString();
}
