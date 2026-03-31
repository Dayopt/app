/**
 * Discoveries — ルールベースの「小さな発見」生成
 *
 * RuleInsights（閾値警告）とは異なり、ユーザーの行動パターンを
 * 淡々と観察して伝える。LLM 不要の純粋関数。
 */

import type {
  Discovery,
  DiscoveryConfig,
  DiscoveryInput,
  EnergyMapRow,
  EstimationAccuracyRow,
  StatsOverviewData,
  TimeByTagRow,
} from '../types/discovery.types';

// =============================================================================
// Default Config
// =============================================================================

const DEFAULT_CONFIG: DiscoveryConfig = {
  minTimePatternEntries: 3,
  minFulfillmentHighlight: 2.5,
  minTagEntries: 3,
  maxResults: 3,
  minBlankDelta: 10,
  minConsistencyRate: 0.8,
};

// =============================================================================
// Day Labels (i18n interpolation用の曜日インデックス)
// =============================================================================

/** dow (0=Sun) → calendar.stats.dow のキー */
const DOW_KEYS: Record<number, string> = {
  0: 'sun',
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
};

// =============================================================================
// Core Function
// =============================================================================

/**
 * データスナップショットからルールベースの「発見」を生成
 *
 * @param input 現在・前期間のデータ
 * @param config カスタム設定（省略時はデフォルト）
 * @returns confidence 降順でソートされた Discovery 配列（maxResults まで）
 */
export function evaluateDiscoveries(
  input: DiscoveryInput,
  config?: Partial<DiscoveryConfig>,
): Discovery[] {
  const c = { ...DEFAULT_CONFIG, ...config };
  const discoveries: Discovery[] = [];

  discoveries.push(...checkTimePatterns(input.energyMap, c));
  discoveries.push(...checkPlanningAccuracy(input.estimationAccuracy, c));
  discoveries.push(...checkTrendComparisons(input.overview, input.prevOverview, c));
  discoveries.push(...checkTagAffinity(input.timeByTag, c));
  discoveries.push(...checkConsistency(input.overview, c));

  return discoveries.sort((a, b) => b.confidence - a.confidence).slice(0, c.maxResults);
}

// =============================================================================
// 1. Time Patterns — 時間帯×曜日の充実度パターン
// =============================================================================

/**
 * EnergyMap から「この曜日のこの時間帯は充実度が高い」パターンを検出
 */
export function checkTimePatterns(energyMap: EnergyMapRow[], config: DiscoveryConfig): Discovery[] {
  const discoveries: Discovery[] = [];

  for (const row of energyMap) {
    if (row.entryCount < config.minTimePatternEntries) continue;
    if (row.avgFulfillment == null) continue;
    if (row.avgFulfillment < config.minFulfillmentHighlight) continue;

    const dayKey = DOW_KEYS[row.dow] ?? String(row.dow);

    discoveries.push({
      category: 'time_pattern',
      messageKey: 'timePatternHighFulfillment',
      messageParams: {
        day: dayKey,
        hour: row.hour,
      },
      // エントリ数が多いほど信頼度が高い
      confidence: row.entryCount * (row.avgFulfillment / 3),
    });
  }

  // 最も信頼度の高い1件のみ返す
  discoveries.sort((a, b) => b.confidence - a.confidence);
  return discoveries.slice(0, 1);
}

// =============================================================================
// 2. Planning Accuracy — 見積もり精度のタグ別パターン
// =============================================================================

/**
 * 見積もり精度が最も高い（deviationが最小の）タグを検出
 */
export function checkPlanningAccuracy(
  estimationAccuracy: EstimationAccuracyRow[],
  config: DiscoveryConfig,
): Discovery[] {
  const qualified = estimationAccuracy.filter((row) => row.entryCount >= config.minTagEntries);
  if (qualified.length === 0) return [];

  // avgDeviationMinutes の絶対値が最小のものを選択
  const best = qualified.reduce((prev, cur) =>
    Math.abs(cur.avgDeviationMinutes) < Math.abs(prev.avgDeviationMinutes) ? cur : prev,
  );

  return [
    {
      category: 'planning_accuracy',
      messageKey: 'bestEstimationTag',
      messageParams: {
        tagName: best.tagName,
        deviation: Math.round(Math.abs(best.avgDeviationMinutes)),
      },
      confidence: best.entryCount * (1 / (1 + Math.abs(best.avgDeviationMinutes))),
    },
  ];
}

// =============================================================================
// 3. Trend Comparisons — 前期間との比較
// =============================================================================

/**
 * 空白時間の前期間比較を検出
 */
export function checkTrendComparisons(
  overview: StatsOverviewData,
  prevOverview: StatsOverviewData | null,
  config: DiscoveryConfig,
): Discovery[] {
  if (!prevOverview) return [];

  const currentBlank = overview.blankRate.blankMinutes;
  const prevBlank = prevOverview.blankRate.blankMinutes;
  const delta = currentBlank - prevBlank;

  if (Math.abs(delta) < config.minBlankDelta) return [];

  const isIncrease = delta > 0;

  return [
    {
      category: 'trend_comparison',
      messageKey: isIncrease ? 'blankTimeIncrease' : 'blankTimeDecrease',
      messageParams: {
        minutes: Math.round(Math.abs(delta)),
      },
      // 変化量が大きいほど興味深い
      confidence: Math.abs(delta) / 60,
    },
  ];
}

// =============================================================================
// 4. Tag Affinity — 充実度の高いタグ
// =============================================================================

/**
 * EnergyMap とタグ別時間からタグ別の平均充実度を算出し、最高のタグを検出
 */
export function checkTagAffinity(timeByTag: TimeByTagRow[], _config: DiscoveryConfig): Discovery[] {
  if (timeByTag.length < 2) return [];

  const sorted = [...timeByTag].sort((a, b) => b.hours - a.hours);
  const top = sorted[0];

  if (!top || top.hours < 1) return [];

  const totalHours = sorted.reduce((sum, t) => sum + t.hours, 0);
  const percentage = Math.round((top.hours / totalHours) * 100);

  // 50%以上を1つのタグに使っている場合のみ報告
  if (percentage < 50) return [];

  return [
    {
      category: 'tag_affinity',
      messageKey: 'topTagUsage',
      messageParams: {
        tagName: top.name,
        percentage,
        hours: Math.round(top.hours * 10) / 10,
      },
      confidence: top.hours / totalHours,
    },
  ];
}

// =============================================================================
// 5. Consistency — 記録の継続性
// =============================================================================

/**
 * entryRate が高い場合に継続性を観察
 */
export function checkConsistency(
  overview: StatsOverviewData,
  config: DiscoveryConfig,
): Discovery[] {
  const rate = overview.entryRate.entryRate;
  if (rate < config.minConsistencyRate) return [];

  return [
    {
      category: 'consistency',
      messageKey: 'consistentRecording',
      messageParams: {
        rate: Math.round(rate * 100),
      },
      confidence: rate,
    },
  ];
}
