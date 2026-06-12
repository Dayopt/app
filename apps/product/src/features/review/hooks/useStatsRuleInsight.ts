'use client';

import { useMemo } from 'react';

import { evaluateRuleInsights, type MetricValues, type RuleInsight } from '../lib/ruleInsights';
import type { StatsPageData } from '../types/metrics.types';

/** 所見を言い切るのに必要な最小記録件数（これ未満は傾向の信頼性が低い） */
const LOW_DATA_ENTRY_THRESHOLD = 5;

interface StatsRuleInsightResult {
  /** severity 最上位の所見 1 件。該当なし・データ不足は null */
  insight: RuleInsight | null;
  /** 記録はあるが件数が少なく、傾向の信頼性が低い期間か */
  isLowData: boolean;
}

/**
 * useStatsRuleInsight — getStatsPageData から研究者の所見を 1 件導出
 *
 * 閾値 + 前期間比トレンドのルール評価（evaluateRuleInsights）に
 * pageData の KPI を流し込み、severity 最上位の 1 件だけ返す。
 * 記録件数が少ない期間は傾向を言い切らず沈黙し、isLowData で
 * 「参考値」注記の表示を呼び出し側に委ねる（研究者の信頼性ガード）。
 */
export function useStatsRuleInsight(pageData: StatsPageData | undefined): StatsRuleInsightResult {
  return useMemo(() => {
    if (!pageData) return { insight: null, isLowData: false };

    const entryCount = pageData.overview.entryCount;
    if (entryCount < LOW_DATA_ENTRY_THRESHOLD) {
      return { insight: null, isLowData: entryCount > 0 };
    }

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

    return { insight: evaluateRuleInsights(current, previous)[0] ?? null, isLowData: false };
  }, [pageData]);
}
