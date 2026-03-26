import { Skeleton } from '@/components/ui/skeleton';

/**
 * Stats タブページのスケルトンUI
 *
 * AppHeader + タブバー + KPIカード + チャートエリアの骨格を表示。
 */
export default function StatsTabLoading() {
  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label="Loading stats"
    >
      {/* AppHeader skeleton */}
      <div className="border-border flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="size-8 rounded-lg" />
        </div>
      </div>

      {/* Tabs skeleton */}
      <div className="border-border flex h-10 items-center gap-4 border-b px-4">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
      </div>

      {/* KPI cards */}
      <div className="flex-1 space-y-4 overflow-hidden p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>

        {/* Main chart */}
        <Skeleton className="h-56 rounded-xl" />

        {/* Sub charts */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
