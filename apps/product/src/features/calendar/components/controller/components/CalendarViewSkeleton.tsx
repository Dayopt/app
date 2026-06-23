'use client';

import { Skeleton } from '@dayopt/components';

/**
 * カレンダービュー用スケルトンローダー
 *
 * CLSを防ぐため、実際のビューと同じサイズ・構造を維持
 * - flex-1 で親コンテナに合わせて伸縮
 * - overflow-hidden で内容がはみ出さないように
 * - shadcn/ui Skeleton で統一（pulse/shimmer対応）
 */
export function CalendarViewSkeleton() {
  return (
    <div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
      {/* 時間グリッド領域（24時間分のスロット） */}
      <div className="flex flex-1 overflow-hidden">
        {/* 時間ラベル列 */}
        <div className="border-border flex w-14 flex-shrink-0 flex-col border-r">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex h-16 items-start justify-end pt-0 pr-2">
              <Skeleton className="h-3 w-8" />
            </div>
          ))}
        </div>

        {/* グリッド本体 */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="border-border flex h-16 border-b">
              {/* ダミーのイベントスロット */}
              {i === 2 && <Skeleton className="m-1 flex-1" />}
              {i === 5 && <Skeleton className="m-1 flex-1" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
