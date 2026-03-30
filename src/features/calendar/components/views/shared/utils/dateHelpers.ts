/**
 * カレンダー固有の日付ヘルパー関数
 *
 * 汎用的な日付操作は `@/lib/date` を使用してください。
 * このファイルにはカレンダービュー固有のユーティリティのみ含まれます。
 */

/**
 * 日付をフォーマット（カレンダービュー用・ロケール対応）
 */
export function formatDate(
  date: Date,
  format: 'short' | 'long' | 'numeric' = 'short',
  locale: string = 'ja',
): string {
  const dateLocale = locale === 'ja' ? 'ja-JP' : 'en-US';

  switch (format) {
    case 'numeric':
      return `${date.getDate()}`;
    case 'short':
      return date.toLocaleDateString(dateLocale, { day: 'numeric', weekday: 'short' });
    case 'long':
      return date.toLocaleDateString(dateLocale, {
        month: 'short',
        day: 'numeric',
        weekday: 'short',
      });
    default:
      return `${date.getDate()}`;
  }
}

/**
 * イベントの妥当性をチェック
 */
export function isValidEvent<T extends { startDate?: Date | string | null }>(event: T): boolean {
  if (!event.startDate) return false;

  const eventStart = event.startDate instanceof Date ? event.startDate : new Date(event.startDate);

  return !isNaN(eventStart.getTime());
}

/**
 * 今日のインデックスを取得（日付配列内での位置）
 */
export function getTodayIndex(dates: Date[]): number {
  const today = new Date();
  return dates.findIndex((date) => date.toDateString() === today.toDateString());
}
