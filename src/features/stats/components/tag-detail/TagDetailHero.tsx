'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { parseColonTag } from '@/features/tags';
import { resolveTagColor } from '@/lib/tag-colors';
import { api } from '@/platform/trpc';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

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
 *
 * 個別クエリを使用し、下のチャートコンポーネントとTanStack Queryキャッシュを共有。
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

  const tagDateRange = { tagId, ...dateRange };

  const cumulative = api.entries.getTagCumulativeTime.useQuery(tagDateRange);
  const fulfillment = api.entries.getTagAvgFulfillment.useQuery(tagDateRange);
  const planRate = api.entries.getTagPlanRate.useQuery(tagDateRange);

  // コロン記法の場合のみ子タグ取得
  const parsed = tagName ? parseColonTag(tagName) : null;
  const hasColonPrefix = parsed?.prefix != null && parsed?.suffix != null;
  const childBreakdown = api.entries.getChildTagBreakdown.useQuery(
    { prefix: parsed?.prefix ?? '', ...dateRange },
    { enabled: hasColonPrefix },
  );

  const isPending = cumulative.isPending || fulfillment.isPending || planRate.isPending;

  if (isPending) {
    return <Skeleton className="h-28 w-full rounded-xl" />;
  }

  const totalMinutes = cumulative.data?.totalMinutes ?? 0;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  const entryCount = fulfillment.data?.entryCount ?? 0;
  const avgFulfillment = fulfillment.data?.avgFulfillment ?? null;
  const planRatePercent = Math.round((planRate.data?.planRate ?? 0) * 100);

  const childTags = childBreakdown.data ?? [];
  const totalChildHours = childTags.reduce((sum, c) => sum + c.hours, 0);

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
        <div className="mt-3">
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
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
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
