import { resolveWorkspaceTab, type WorkspaceTab } from '@/features/calendar';

/**
 * ロケール込みの pathname から現在のワークスペースタブを判定する。
 *
 * `usePathname()`（`@dayopt/i18n/navigation`。next-intl 版で locale 済み剥がし）
 * だけを入力にし、`useSearchParams()` は使わない（view 変更のたびに子ツリーが
 * 再マウントされるのを防ぐため。overview.md §5-3）。
 */
export function getWorkspaceTabFromPath(pathname: string): WorkspaceTab {
  return resolveWorkspaceTab(pathname);
}
