import { ReportFilterList, SegmentList } from '@/features/review';

/**
 * Report タブの Sidebar 本体（Composition Layer、スクロール領域）。
 *
 * MiniCalendar は Sidebar の pinned 領域（プロフィール直上）へ移動済み（#2217）。
 * 上から「カテゴリ」→「セグメント」の 2 見出し
 * （仕様 §3.3）。セグメント一覧はレンズ選択と CRUD を 1 本で兼ねる（#2578）。
 */
export function ReportSidebar() {
  return (
    <div className="flex min-w-0 flex-col gap-2 overflow-hidden px-2 py-2">
      <ReportFilterList />
      <SegmentList />
    </div>
  );
}
