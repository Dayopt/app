'use client';

import { useMemo } from 'react';

import { api } from '@/platform/trpc';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import { evaluateDiscoveries } from '../lib/discoveries';
import { useStatsFilterStore } from '../stores/useStatsFilterStore';
import type { DiscoveryInput } from '../types/discovery.types';
import { computePreviousDateRange, computeStatsDateRange } from '../utils/computeDateRange';

// =============================================================================
// Hook
// =============================================================================

/**
 * useDiscoveries — 「小さな発見」の取得・評価を一括処理
 *
 * 既存の tRPC クエリを再利用（TanStack Query キャッシュ共有）。
 * Review/Progress タブ訪問済みなら追加リクエスト 0。
 */
export function useDiscoveries() {
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const granularity = useStatsFilterStore((s) => s.granularity);
  const timezone = useCalendarSettingsStore((s) => s.timezone);
  const weekStartsOn = useCalendarSettingsStore((s) => s.weekStartsOn);

  const dateRange = useMemo(
    () => computeStatsDateRange(currentDate, granularity, timezone, weekStartsOn),
    [currentDate, granularity, timezone, weekStartsOn],
  );
  const prevDateRange = useMemo(
    () => computePreviousDateRange(currentDate, granularity, timezone, weekStartsOn),
    [currentDate, granularity, timezone, weekStartsOn],
  );

  // 既存エンドポイントを再利用（キャッシュ共有で重複リクエストなし）
  const energyMap = api.entries.getEnergyMap.useQuery(dateRange);
  const estimationAccuracy = api.entries.getEstimationAccuracy.useQuery(dateRange);
  const timeByTag = api.entries.getTimeByTag.useQuery(dateRange);
  const overview = api.entries.getStatsOverview.useQuery(dateRange);
  const prevOverview = api.entries.getStatsOverview.useQuery(prevDateRange);

  const isLoading =
    energyMap.isPending ||
    estimationAccuracy.isPending ||
    timeByTag.isPending ||
    overview.isPending;

  const discoveries = useMemo(() => {
    if (!energyMap.data || !overview.data) return [];

    const input: DiscoveryInput = {
      energyMap: energyMap.data,
      estimationAccuracy: (estimationAccuracy.data ?? []).map((row) => ({
        tagId: row.tagId,
        tagName: row.tagName,
        avgDeviationMinutes: row.avgDeviationMinutes,
        entryCount: row.entryCount,
      })),
      timeByTag: (timeByTag.data ?? []).map((row) => ({
        tagId: row.tagId,
        name: row.name,
        hours: row.hours,
        color: row.color,
      })),
      overview: overview.data,
      prevOverview: prevOverview.data ?? null,
    };

    return evaluateDiscoveries(input);
  }, [energyMap.data, estimationAccuracy.data, timeByTag.data, overview.data, prevOverview.data]);

  return { discoveries, isLoading };
}
