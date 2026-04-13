/**
 * Stats Feature - Public API
 *
 * 統計・分析機能のエントリポイント。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 */

// =============================================================================
// Components
// =============================================================================
export { BadgeSection } from './components/badges/BadgeSection';
export { InsightsView } from './components/insights/InsightsView';
export { ProgressView } from './components/progress/ProgressView';
export { StatsLayout } from './components/StatsLayout';
export type { TagTabInfo } from './components/StatsLayout';
export { StatsView } from './components/StatsView';

// =============================================================================
// Stores
// =============================================================================
export { useStatsFilterStore } from './stores/useStatsFilterStore';
export type { StatsGranularity } from './stores/useStatsFilterStore';

// =============================================================================
// Types
// =============================================================================
export type { StatsViewProps } from './types/stats.types';

// =============================================================================
// Lib
// =============================================================================
export { TagDetailPage } from './components/tag-detail/TagDetailPage';
export { METRIC_DEFINITIONS, METRIC_ORDER } from './lib/metricDefinitions';
export {
  calculateDeepUtilization,
  formatMetricValue,
  formatMetricValueParts,
  getMetricTrend,
} from './lib/metrics';
// prefetchStatsData / prefetchTagDetailData はサーバー専用（next/headers使用）。
// 各ファイルに import 'server-only' ガード済み。
export { prefetchStatsData } from './lib/prefetch';
export { prefetchTagDetailData } from './lib/prefetchTagDetail';

// ここにないものはfeature内部専用
