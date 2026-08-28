/**
 * ワークスペースビューのルーティングユーティリティ
 *
 * URLパスが workspace の時間軸ビュー（`/calendar`）かどうかを判定する。
 *
 * 旧 day/week/Nday は proxy.ts の redirect で `/calendar` へ集約済み
 * （workspace-shell-restructure epic #2181 Step 6 完了。#2195）。
 * アプリ内部の pathname 判定はこの関数を含め `/calendar` の完全一致のみを見ればよい。
 */

/**
 * ロケールを除いたパスが workspace の時間軸ビュー（`/calendar`）かどうかを判定
 *
 * @param pathWithoutLocale - ロケールプレフィックスを除いたパス（例: "/calendar", "/calendar?view=week"）
 */
export function isCalendarViewPath(pathWithoutLocale: string): boolean {
  const [pathOnly] = pathWithoutLocale.split('?');

  // `/calendar` は完全一致のみ（`/calendar/day` 等のサブパスは新URL契約に存在しない）
  return pathOnly === '/calendar';
}

/**
 * ワークスペースタブの判定に使う3値。
 *
 * **UI 上のタブは 'calendar' | 'report' の2値**（第3のタブは作らない。
 * 旧 docs/projects/_archive/workspace-shell-restructure/overview.md §5-2・§6-9・§6-11、
 * docs/projects 全廃に伴い #2473 で削除。git 履歴参照）。
 * `'other'` は UI タブではなく、CalendarNavigationContext が `/settings` 等の
 * workspace 外パスで view/date のパースを止めるための内部状態（§5-4「`/settings`
 * は calendar として扱う」は dispatcher 側の 2 値折り畳みで満たす。§4-2-b・
 * §6-10 B の resolveCalendarProps・popstate ハンドラは 'other' を別枝として
 * 扱う必要があるため、型としては3値のまま残す）。
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
