/**
 * Stats Feature - Public API
 *
 * 統計・分析機能のエントリポイント。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 */

// =============================================================================
// Components
// =============================================================================
export { ReviewLayout } from './components/ReviewLayout';
export { StatsView } from './components/StatsView';

// =============================================================================
// Stores
// =============================================================================
export { useStatsFilterStore } from './stores/useStatsFilterStore';
export type { StatsGranularity } from './stores/useStatsFilterStore';

// =============================================================================
// Lib
// =============================================================================
export { TagDetailPage } from './components/tag-detail/TagDetailPage';
// prefetchStatsData / prefetchTagDetailData はサーバー専用（next/headers使用）。
// 各ファイルに import 'server-only' ガード済み。
export { prefetchStatsData } from './lib/prefetch';
export { prefetchTagDetailData } from './lib/prefetchTagDetail';

// ここにないものはfeature内部専用
