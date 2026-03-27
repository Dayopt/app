/**
 * Stats Feature - Public API
 *
 * 統計・分析機能のエントリポイント。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 */

// =============================================================================
// Components
// =============================================================================
export { StatsPageContent } from './components/StatsPageContent';
export { StatsView } from './components/StatsView';

// =============================================================================
// Stores
// =============================================================================
export { useStatsFilterStore } from './stores/useStatsFilterStore';
export type { StatsGranularity, StatsTab } from './stores/useStatsFilterStore';

// =============================================================================
// Types
// =============================================================================
export type {
  BlankRateData,
  ContextSwitchData,
  DeepUtilizationData,
  EnergyMapRow,
  EntryRateData,
  EstimationAccuracyData,
  MetricData,
  MetricDefinition,
  MetricFormat,
  MetricId,
  MetricTrend,
  MetricValueParts,
} from './types/metrics.types';
export type { StatsViewProps } from './types/stats.types';

// =============================================================================
// Lib
// =============================================================================
export { METRIC_DEFINITIONS, METRIC_ORDER } from './lib/metricDefinitions';
export {
  calculateDeepUtilization,
  formatMetricValue,
  formatMetricValueParts,
  getMetricTrend,
} from './lib/metrics';
export { prefetchStatsData } from './lib/prefetch';
