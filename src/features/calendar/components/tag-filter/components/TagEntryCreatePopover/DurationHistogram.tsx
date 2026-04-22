'use client';

import { getTagColorClasses } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';
import { HISTOGRAM_MIN_SAMPLES, type DurationBin } from './computeDurationDistribution';

interface DurationHistogramProps {
  bins: DurationBin[];
  sampleSize: number;
  tagColor: string | null;
}

/**
 * duration 分布のヒストグラム。
 *
 * - sampleSize >= 10 のときのみ bar を描画
 * - sampleSize < 10 でも min-h-20 (80px) は常時確保して layout shift 防止
 * - bar の色は タグ色を使用（色ドットと揃える）
 */
export function DurationHistogram({ bins, sampleSize, tagColor }: DurationHistogramProps) {
  const visible = sampleSize >= HISTOGRAM_MIN_SAMPLES && bins.length > 0;
  const maxCount = visible ? Math.max(...bins.map((b) => b.count)) : 0;
  const colorClasses = getTagColorClasses(tagColor);

  return (
    <div className="min-h-20" aria-hidden={!visible}>
      {visible ? (
        <div className="flex h-20 w-full items-end gap-1">
          {bins.map((bin) => {
            const heightRatio = maxCount > 0 ? bin.count / maxCount : 0;
            return (
              <div
                key={bin.durationMinutes}
                className={cn('flex-1 rounded-lg', colorClasses.dot)}
                style={{ height: `${Math.max(heightRatio * 100, 4)}%` }}
                aria-label={`${bin.durationMinutes}分: ${bin.count}件`}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
