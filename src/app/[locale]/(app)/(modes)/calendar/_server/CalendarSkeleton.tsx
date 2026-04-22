import { Skeleton } from '@/lib/components/ui/skeleton';

/**
 * カレンダービューのスケルトンUI
 *
 * loading.tsx および Suspense fallback で共有。
 * AppHeader + タイムライン構造を模した骨格を表示する。
 */
export function CalendarSkeleton() {
  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label="Loading calendar"
    >
      {/* AppHeader skeleton */}
      <div className="border-border flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-5 w-28" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-8 w-16 rounded-lg" />
        </div>
      </div>

      {/* Timeline skeleton */}
      <div className="flex-1 space-y-1 overflow-hidden p-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-4 w-10 flex-shrink-0" />
            <div className="border-border h-14 flex-1 border-t" />
          </div>
        ))}
      </div>
    </div>
  );
}
