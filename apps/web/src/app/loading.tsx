import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div
      className="flex min-h-screen items-center justify-center"
      role="status"
      aria-busy="true"
      aria-label="Loading page content"
    >
      <div className="w-full max-w-md space-y-8 px-4">
        {/* スピナー */}
        <div className="flex justify-center">
          <Skeleton className="size-16 rounded-full" />
        </div>

        {/* テキスト */}
        <div className="space-y-2 text-center">
          <Skeleton className="mx-auto h-6 w-32" />
          <Skeleton className="mx-auto h-4 w-64" />
        </div>

        {/* コンテンツスケルトン */}
        <div className="space-y-4 pt-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="size-4/6" />
        </div>
      </div>
    </div>
  );
}
