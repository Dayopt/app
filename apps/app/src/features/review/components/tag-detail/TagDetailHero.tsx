'use client';

import { useTranslations } from 'next-intl';

import { Skeleton } from '@/lib/components/ui/skeleton';
import { resolveTagColor } from '@/lib/tag-colors';

import { useTagOverviewData } from '../../hooks/useTagDetailData';

interface TagDetailHeroProps {
  tagId: string;
}

/**
 * タグ詳細 Hero セクション
 *
 * 合計時間を大きく表示 + サブメトリクス（エントリ数、計画率、充実度）
 * 子タグがある場合はスタックバーも表示
 *
 * getTagOverview で全データを一括取得。
 */
export function TagDetailHero({ tagId }: TagDetailHeroProps) {
  const t = useTranslations('calendar.stats.tagDetail');

  const { data: overview, isPending } = useTagOverviewData(tagId);

  if (isPending) {
    return <Skeleton className="h-28 w-full rounded-2xl" />;
  }

  const totalMinutes = overview?.totalMinutes ?? 0;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  const entryCount = overview?.entryCount ?? 0;
  const avgFulfillment = overview?.avgFulfillment ?? null;
  const planRatePercent = Math.round((overview?.planRate ?? 0) * 100);

  const childTags = overview?.childTags ?? [];
  const totalChildHours = childTags.reduce((sum, c) => sum + c.hours, 0);

  return (
    <div className="bg-card border-border-subtle rounded-2xl border p-4 shadow-sm">
      {/* メイン数字 */}
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-medium tabular-nums">
          {hours > 0 && (
            <>
              {hours}
              <span className="text-muted-foreground text-lg font-normal">h</span>{' '}
            </>
          )}
          {minutes}
          <span className="text-muted-foreground text-lg font-normal">m</span>
        </span>
      </div>

      {/* サブメトリクス */}
      <div className="text-muted-foreground mt-2 flex gap-4 text-sm">
        <span>
          {entryCount} {t('entries')}
        </span>
        <span>
          {t('planRate')} {planRatePercent}%
        </span>
        {avgFulfillment !== null && (
          <span>
            {t('fulfillment')} {avgFulfillment.toFixed(1)}
          </span>
        )}
      </div>

      {/* 子タグバー */}
      {childTags.length > 0 && totalChildHours > 0 && (
        <div className="mt-4">
          <div className="flex h-2 w-full overflow-hidden rounded-full">
            {childTags.map((child) => {
              const widthPercent = (child.hours / totalChildHours) * 100;
              if (widthPercent < 1) return null;
              const color = resolveTagColor(child.color);
              return (
                <div
                  key={child.tagId}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{
                    width: `${widthPercent}%`,
                    backgroundColor: `var(--tag-${color})`,
                  }}
                  title={`${child.name}: ${child.hours.toFixed(1)}h`}
                />
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1">
            {childTags.map((child) => {
              const color = resolveTagColor(child.color);
              return (
                <span
                  key={child.tagId}
                  className="text-muted-foreground flex items-center gap-1 text-xs"
                >
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ backgroundColor: `var(--tag-${color})` }}
                  />
                  {child.name} - {child.hours.toFixed(1)}h
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
