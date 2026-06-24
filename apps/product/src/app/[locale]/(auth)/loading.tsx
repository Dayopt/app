import { Skeleton } from '@dayopt/components';

/**
 * 認証ページのローディングUI
 * ページ遷移時に即座に表示され、体感速度を向上
 */
export default function AuthLoading() {
  return (
    <div
      className="bg-surface-container flex min-h-svh flex-col items-center justify-center p-4 md:p-8"
      role="status"
      aria-live="polite"
      aria-label="Loading authentication"
    >
      <div className="w-full md:max-w-5xl">
        {/* ロゴ */}
        <div className="mb-8 flex justify-center">
          <Skeleton className="size-12 rounded-2xl" />
        </div>

        {/* タイトル */}
        <div className="mb-6 flex flex-col items-center gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>

        {/* フォーム */}
        <div className="mx-auto max-w-md space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>

        {/* ソーシャルログイン */}
        <div className="mx-auto mt-6 max-w-md">
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}
