'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/platform/trpc';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import { useStatsFilterStore } from '../../stores/useStatsFilterStore';
import { computeStatsDateRange } from '../../utils/computeDateRange';

const SCORE_CONFIG = [
  { score: 3, emoji: '😊', label: 'Good' },
  { score: 2, emoji: '😐', label: 'OK' },
  { score: 1, emoji: '😞', label: 'Low' },
] as const;

interface TagFulfillmentDistributionProps {
  tagId: string;
}

/**
 * タグ別充実度分布
 *
 * 😊/😐/😞 の割合をバーで表示。
 */
export function TagFulfillmentDistribution({ tagId }: TagFulfillmentDistributionProps) {
  const t = useTranslations('calendar.stats.tagDetail');
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const granularity = useStatsFilterStore((s) => s.granularity);
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  const dateRange = useMemo(
    () => computeStatsDateRange(currentDate, granularity, timezone, weekStartsOn),
    [currentDate, granularity, timezone, weekStartsOn],
  );

  const { data, isPending } = api.entries.getTagFulfillmentDistribution.useQuery({
    tagId,
    ...dateRange,
  });

  if (isPending) {
    return (
      <Card className="border-none">
        <CardHeader>
          <CardTitle className="text-sm">{t('fulfillmentDistribution')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="border-none">
        <CardHeader>
          <CardTitle className="text-sm">{t('fulfillmentDistribution')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground flex h-16 items-center justify-center text-sm">
            {t('noData')}
          </div>
        </CardContent>
      </Card>
    );
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);
  const countMap = new Map(data.map((d) => [d.score, d.count]));

  return (
    <Card className="border-none">
      <CardHeader>
        <CardTitle className="text-sm">{t('fulfillmentDistribution')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {SCORE_CONFIG.map((cfg) => {
            const count = countMap.get(cfg.score) ?? 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={cfg.score} className="flex items-center gap-3">
                <span className="w-6 text-center text-lg">{cfg.emoji}</span>
                <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-muted-foreground w-10 text-right font-mono text-xs">
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
