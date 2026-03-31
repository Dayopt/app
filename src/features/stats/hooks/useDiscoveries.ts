'use client';

import { useMemo } from 'react';

import { evaluateDiscoveries } from '../lib/discoveries';
import type { DiscoveryInput, StatsOverviewData } from '../types/discovery.types';
import type { StatsPageData } from '../types/metrics.types';

// =============================================================================
// Helpers
// =============================================================================

/** StatsPageData.overview → StatsOverviewData に変換 */
function toOverviewData(o: StatsPageData['overview']): StatsOverviewData {
  return {
    cumulativeTime: { totalMinutes: o.totalMinutes },
    avgFulfillment: { avgFulfillment: o.avgFulfillment, entryCount: o.entryCount },
    entryRate: {
      totalEntries: o.totalEntries,
      plannedEntries: o.plannedEntries,
      entryRate: o.planRate,
    },
    contextSwitches: { totalSwitches: 0, avgPerDay: 0 },
    blankRate: { availableMinutes: 0, scheduledMinutes: 0, blankMinutes: 0, blankRate: 0 },
  };
}

// =============================================================================
// Hook
// =============================================================================

/**
 * useDiscoveries — 「小さな発見」の評価
 *
 * 統合クエリ StatsPageData から全データを受け取り、ルールベースの発見を評価。
 */
export function useDiscoveries(pageData: StatsPageData | undefined) {
  const discoveries = useMemo(() => {
    if (!pageData) return [];

    const input: DiscoveryInput = {
      energyMap: pageData.energyMap,
      estimationAccuracy: pageData.estimationAccuracy.map((row) => ({
        tagId: row.tagId,
        tagName: row.tagName,
        avgDeviationMinutes: row.avgDeviationMinutes,
        entryCount: row.entryCount,
      })),
      timeByTag: pageData.timeByTag.map((row) => ({
        tagId: row.tagId,
        name: row.name,
        hours: row.hours,
        color: row.color,
      })),
      overview: toOverviewData(pageData.overview),
      prevOverview: toOverviewData(pageData.prevOverview),
    };

    return evaluateDiscoveries(input);
  }, [pageData]);

  return { discoveries, isLoading: !pageData };
}
