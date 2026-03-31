'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { parseColonTag } from '@/features/tags';
import { resolveTagColor } from '@/lib/tag-colors';
import { api } from '@/platform/trpc';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import { useStatsFilterStore } from '../../stores/useStatsFilterStore';
import { computeStatsDateRange } from '../../utils/computeDateRange';
import { formatHours } from '../../utils/formatHours';

interface ChildTagBreakdownProps {
  tagId: string;
  tagName: string;
}

/**
 * コロン記法子タグの時間内訳
 *
 * 「開発:API」「開発:Frontend」等のような子タグがある場合のみ表示。
 * 子タグが無い場合は何もレンダリングしない。
 */
export function ChildTagBreakdown({ tagName }: ChildTagBreakdownProps) {
  const t = useTranslations('calendar.stats.tagDetail');
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const granularity = useStatsFilterStore((s) => s.granularity);
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  const dateRange = useMemo(
    () => computeStatsDateRange(currentDate, granularity, timezone, weekStartsOn),
    [currentDate, granularity, timezone, weekStartsOn],
  );

  // コロン記法のプレフィックスを取得（「開発:API」→「開発」）
  const parsed = parseColonTag(tagName);
  const prefix = parsed.suffix ? parsed.prefix : tagName;

  const { data, isPending } = api.entries.getChildTagBreakdown.useQuery(
    { prefix, ...dateRange },
    { enabled: !!tagName },
  );

  // 子タグが無い場合は非表示
  if (!isPending && (!data || data.length === 0)) {
    return null;
  }

  if (isPending) {
    return <Skeleton className="h-32 w-full rounded-2xl" />;
  }

  const totalHours = data.reduce((sum, child) => sum + child.hours, 0);

  return (
    <Card className="border-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{t('childTags')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {data.map((child) => {
            const pct = totalHours > 0 ? Math.round((child.hours / totalHours) * 100) : 0;
            const color = resolveTagColor(child.color);
            const displayName = parseColonTag(child.name).suffix ?? child.name;

            return (
              <div key={child.tagId}>
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2 shrink-0 rounded-lg"
                      style={{ backgroundColor: `var(--tag-${color})` }}
                    />
                    <span className="text-foreground text-sm font-medium">{displayName}</span>
                  </div>
                  <span className="text-muted-foreground font-mono text-xs">
                    {formatHours(child.hours)} ({pct}%)
                  </span>
                </div>
                <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: `var(--tag-${color})`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
