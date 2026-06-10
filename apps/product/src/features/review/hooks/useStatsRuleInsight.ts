'use client';

import { useMemo } from 'react';

import { evaluateRuleInsights, type MetricValues, type RuleInsight } from '../lib/ruleInsights';
import type { StatsPageData } from '../types/metrics.types';

/**
 * useStatsRuleInsight — getStatsPageData から研究者の所見を 1 件導出
 *
 * 閾値 + 前期間比トレンドのルール評価（evaluateRuleInsights）に
 * pageData の KPI を流し込み、severity 最上位の 1 件だけ返す。
 * 該当なし・データ未取得は null（所見スロットは沈黙する）。
 */
export function useStatsRuleInsight(pageData: StatsPageData | undefined): RuleInsight | null {
  return useMemo(() => {
    if (!pageData) return null;

    const current: MetricValues = {
      totalTime: pageData.overview.totalMinutes,
      entryRate: pageData.overview.planRate,
      contextSwitches: pageData.contextSwitches.avgPerDay,
      blankRate: pageData.blankRate.blankRate,
    };
    if (pageData.overview.avgFulfillment != null) {
      current.avgFulfillment = pageData.overview.avgFulfillment;
    }

    const previous: MetricValues = {
      totalTime: pageData.prevOverview.totalMinutes,
      entryRate: pageData.prevOverview.planRate,
    };
    if (pageData.prevOverview.avgFulfillment != null) {
      previous.avgFulfillment = pageData.prevOverview.avgFulfillment;
    }

    return evaluateRuleInsights(current, previous)[0] ?? null;
  }, [pageData]);
}
