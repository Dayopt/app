import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface BlogSkeletonProps {
  className?: string;
}

export function BlogSkeleton({ className }: BlogSkeletonProps) {
  return (
    <div className={cn('divide-border divide-y', className)}>
      {[...Array(6)].map((_, i) => (
        <BlogCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function BlogCardSkeleton() {
  return (
    <div className="flex items-center gap-5 py-6 first:pt-0">
      {/* カバー画像スケルトン */}
      <Skeleton className="h-32 w-56 flex-shrink-0 rounded-xl" />

      {/* コンテンツスケルトン */}
      <div className="min-w-0 flex-1 space-y-3">
        {/* タイトル */}
        <Skeleton className="h-5 w-3/4" />

        {/* タグ */}
        <div className="flex gap-1">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-6 w-16 rounded-lg" />
          ))}
        </div>

        {/* 日付 */}
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}
