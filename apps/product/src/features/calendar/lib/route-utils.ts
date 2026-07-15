/**
 * ワークスペースビューのルーティングユーティリティ
 *
 * URLパスが workspace の時間軸ビュー（day / week / Nday）かどうかを判定する。
 * URL は calendar namespace を持たず workspace 直下に平坦化されている。
 * 例: /day, /week, /3day（旧 /calendar/day, /calendar/week, /calendar/3day）
 */

const CALENDAR_VIEWS = ['day', 'week'];

/**
 * ロケールを除いたパスが workspace の時間軸ビューかどうかを判定
 *
 * @param pathWithoutLocale - ロケールプレフィックスを除いたパス（例: "/day", "/week?date=2026-01-01", "/3day"）
 */
export function isCalendarViewPath(pathWithoutLocale: string): boolean {
  // 先頭セグメントを取得（"/day" -> "day", "/week?date=..." -> "week?date=..."）
  const segment = pathWithoutLocale.split('/')[1];
  if (!segment) return false;

  // query string を除去
  const clean = segment.split('?')[0];
  if (!clean) return false;

  if (CALENDAR_VIEWS.includes(clean)) return true;
  // multi-day view: 2day〜7day（厳密に「2〜7の1桁+day」のみ）
  return /^[2-7]day$/.test(clean);
}
