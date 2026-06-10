'use client';

import { useMemo } from 'react';

import { resolveTagColor } from '@/features/tags';
import { api } from '@/lib/trpc';

import type { TagBalanceRow } from '../components/review/TagBalancePanel';
import type { StatsPageData } from '../types/metrics.types';

/**
 * useTagBalanceRows — タグバランス行の導出（月次 / 年次ビュー用）
 *
 * getStatsPageData の timeByTag を優先し、欠落・エラー時は Free の
 * getTimeByTag にフォールバックする（週次ビューと同じ戦略）。
 */
export function useTagBalanceRows(
  pageData: StatsPageData | undefined,
  dateRange: { startDate: string; endDate: string },
  isStatsError: boolean,
) {
  const fallbackQuery = api.entries.getTimeByTag.useQuery(
    {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    },
    {
      enabled: isStatsError || !pageData?.timeByTag?.length,
    },
  );

  const timeByTag = pageData?.timeByTag?.length ? pageData.timeByTag : fallbackQuery.data;

  const rows = useMemo<TagBalanceRow[]>(() => {
    if (!timeByTag) return [];

    const mapped = timeByTag.map((tag) => ({
      tagId: tag.tagId,
      tagName: tag.name,
      tagColor: resolveTagColor(tag.color),
      tagIcon: null,
      minutes: Math.round(tag.hours * 60),
    }));
    const total = mapped.reduce((sum, tag) => sum + tag.minutes, 0);

    return mapped
      .filter((tag) => tag.minutes > 0)
      .map((tag) => ({
        ...tag,
        percentage: total > 0 ? Math.round((tag.minutes / total) * 100) : 0,
      }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [timeByTag]);

  return {
    rows,
    isFallbackPending: fallbackQuery.isPending,
    isFallbackFetching: fallbackQuery.isFetching,
    isFallbackError: fallbackQuery.isError,
  };
}
