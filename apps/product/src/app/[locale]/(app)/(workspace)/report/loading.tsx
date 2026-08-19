import { Skeleton } from '@dayopt/components';

export default function ReportLoading() {
  return (
    <div
      className="flex h-full flex-col gap-4 overflow-hidden p-8"
      role="status"
      aria-live="polite"
    >
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
