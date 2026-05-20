/**
 * カレンダービューのルーティングユーティリティ
 *
 * URLパスからカレンダービューページかどうかを判定する。
 * /calendar/day, /calendar/week 等のネスト構造に対応。
 */

const CALENDAR_VIEWS = ['day', 'week'];

/**
 * ロケールを除いたパスがカレンダービューかどうかを判定
 *
 * @param pathWithoutLocale - ロケールプレフィックスを除いたパス（例: "/calendar/day", "/calendar/week?date=2026-01-01", "/calendar/3day"）
 */
export function isCalendarViewPath(pathWithoutLocale: string): boolean {
  // /calendar/ プレフィックスをチェック
  if (!pathWithoutLocale.startsWith('/calendar')) return false;

  // /calendar の後のセグメントを取得
  const segment = pathWithoutLocale.split('/')[2];
  if (!segment) return false;

  // query string を除去
  const clean = segment.split('?')[0];
  if (!clean) return false;

  if (CALENDAR_VIEWS.includes(clean)) return true;
  // multi-day view: 2day〜9day
  return /^\d+day$/.test(clean);
}
