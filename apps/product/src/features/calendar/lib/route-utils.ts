/**
 * ワークスペースビューのルーティングユーティリティ
 *
 * URLパスが workspace の時間軸ビュー（/calendar または旧 day / week / Nday）
 * かどうかを判定する。
 *
 * `/calendar` は新URL契約（view はクエリで受ける）、旧 day/week/Nday は
 * workspace-shell-restructure Step 6（旧route削除）まで二重解決のために残す
 * （docs/projects/workspace-shell-restructure/overview.md §9「Step 1 と
 * Step 2 を分ける理由」）。
 */

const CALENDAR_VIEWS = ['day', 'week'];

/**
 * ロケールを除いたパスが workspace の時間軸ビューかどうかを判定
 *
 * @param pathWithoutLocale - ロケールプレフィックスを除いたパス（例: "/calendar", "/day", "/week?date=2026-01-01", "/3day"）
 */
export function isCalendarViewPath(pathWithoutLocale: string): boolean {
  const [pathOnly] = pathWithoutLocale.split('?');

  // `/calendar` は完全一致のみ（`/calendar/day` 等のサブパスは新URL契約に存在しない）
  if (pathOnly === '/calendar') return true;

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

/**
 * Sidebar タブ（カレンダー / レポート）の判定に使う3値。
 *
 * `/settings` 等の workspace 外のパスは 'other' として扱う（第3のタブは作らない。
 * docs/projects/workspace-shell-restructure/overview.md §5-2）。
 */
export type WorkspaceTab = 'calendar' | 'report' | 'other';

/**
 * ロケールを除いたパスから現在のワークスペースタブを判定する。
 *
 * `usePathname()` だけで判定し、`useSearchParams()` は使わない
 * （view 変更のたびに子ツリーが再マウントされるのを防ぐため。overview.md §5-3）。
 */
export function resolveWorkspaceTab(pathWithoutLocale: string): WorkspaceTab {
  if (pathWithoutLocale === '/report') return 'report';
  if (isCalendarViewPath(pathWithoutLocale)) return 'calendar';
  return 'other';
}
