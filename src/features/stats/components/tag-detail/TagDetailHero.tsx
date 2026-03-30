'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { resolveTagColor } from '@/lib/tag-colors';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import { api } from '@/platform/trpc';
import { useStatsFilterStore } from '../../stores/useStatsFilterStore';
import { computeStatsDateRange } from '../../utils/computeDateRange';

interface TagDetailHeroProps {
  tagId: string;
  tagName: string;
}

/**
 * タグ詳細 Hero セクション
 *
 * 合計時間を大きく表示 + サブメトリクス（エントリ数、計画率、充実度）
 * 子タグがある場合はスタックバーも表示
 */
export function TagDetailHero({ tagId, tagName }: TagDetailHeroProps) {
  const t = useTranslations('calendar.stats.tagDetail');
  const granularity = useStatsFilterStore((s) => s.granularity);
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  const dateRange = useMemo(
    () => computeStatsDateRange(currentDate, granularity, timezone, weekStartsOn),
    [currentDate, granularity, timezone, weekStartsOn],
  );

  const { data, isPending } = api.entries.getTagOverview.useQuery({
    tagId,
    tagName,
    ...dateRange,
  });

  if (isPending) {
    return <Skeleton className="h-28 w-full rounded-xl" />;
  }

  if (!data) return null;

  const hours = Math.floor(data.totalMinutes / 60);
  const minutes = Math.round(data.totalMinutes % 60);
  const planRatePercent = Math.round(data.planRate * 100);
  const hasChildren = data.childTags.length > 0;
  const totalChildHours = data.childTags.reduce((sum, c) => sum + c.hours, 0);

  return (
    <div className="bg-card border-border-subtle rounded-xl border p-4 shadow-sm">
      {/* メイン数字 */}
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums">
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
          {data.entryCount} {t('entries')}
        </span>
        <span>
          {t('planRate')} {planRatePercent}%
        </span>
        {data.avgFulfillment !== null && (
          <span>
            {t('fulfillment')} {data.avgFulfillment.toFixed(1)}
          </span>
        )}
      </div>

      {/* 子タグバー */}
      {hasChildren && totalChildHours > 0 && (
        <div className="mt-3">
          <div className="flex h-2 w-full overflow-hidden rounded-full">
            {data.childTags.map((child) => {
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
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {data.childTags.map((child) => {
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
                  {child.name.split(':').pop()} — {child.hours.toFixed(1)}h
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
