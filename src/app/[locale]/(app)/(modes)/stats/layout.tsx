import { SidebarPageNav } from '../../_shell/SidebarPageNav';

import { StatsLayoutShell } from './_composition/StatsLayoutShell';

/**
 * Stats 共通レイアウト
 *
 * ヘッダー（日付ナビ）+ タブバーは layout で1回だけマウント。
 * タブ遷移時はコンテンツ（children）だけが差し替わる。
 */
export default function StatsLayout({ children }: { children: React.ReactNode }) {
  return <StatsLayoutShell headerRightExtra={<SidebarPageNav />}>{children}</StatsLayoutShell>;
}
