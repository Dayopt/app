import { SegmentList } from '@/features/review';

/**
 * Report タブの Sidebar 本体（Composition Layer、スクロール領域）。
 *
 * MiniCalendar は Sidebar の pinned 領域（プロフィール直上）へ移動済み（#2217）。
 * セグメント一覧の CRUD はここで完結する（#2181 Step 5、overview.md §5-5）。
 */
export function ReportSidebar() {
  return (
    <div className="flex flex-col gap-2 py-2">
      <SegmentList />
    </div>
  );
}
