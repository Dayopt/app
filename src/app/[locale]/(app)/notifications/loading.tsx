import { Skeleton } from '@/lib/components/ui/skeleton';

/**
 * 通知ページのローディングUI
 * ページ遷移時に即座に表示され、白画面を防止
 */
export default function NotificationsLoading() {
  return (
    <div
      className="flex h-full flex-col"
      role="status"
      aria-live="polite"
      aria-label="Loading notifications"
    >
      {/* AppHeader skeleton */}
      <div className="border-border flex h-12 shrink-0 items-center justify-between border-b px-4">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="size-8 rounded-lg" />
      </div>

      {/* Tabs skeleton */}
      <div className="flex gap-4 px-4 pt-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-12" />
      </div>

      {/* List items skeleton */}
      <div className="flex flex-col gap-4 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
