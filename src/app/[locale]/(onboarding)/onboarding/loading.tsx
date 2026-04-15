import { Skeleton } from '@/lib/components/ui/skeleton';

/**
 * オンボーディングページのローディングUI
 * ページ遷移時に即座に表示され、白画面を防止
 */
export default function OnboardingLoading() {
  return (
    <div
      className="w-full max-w-md space-y-6 px-4"
      role="status"
      aria-live="polite"
      aria-label="Loading onboarding"
    >
      {/* Step indicator skeleton */}
      <div className="flex justify-center gap-2">
        <Skeleton className="size-2 rounded-full" />
        <Skeleton className="size-2 rounded-full" />
      </div>

      {/* Title + description skeleton */}
      <div className="space-y-2 text-center">
        <Skeleton className="mx-auto h-8 w-48" />
        <Skeleton className="mx-auto h-4 w-64" />
      </div>

      {/* Form field skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>

      {/* Button skeleton */}
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  );
}
