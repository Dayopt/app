/**
 * Stats Feature - Public API
 *
 * 統計・分析機能のエントリポイント。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 */

// =============================================================================
// Components
// =============================================================================
export { ReviewTagChipRow } from './components/mobile/ReviewTagChipRow';
export { CalendarReviewPanel } from './components/panel/CalendarReviewPanel';
export { ReviewLayout } from './components/ReviewLayout';
export { ReviewView } from './components/ReviewView';
export { EntryMicroInsight } from './components/shared/EntryMicroInsight';
export { ReviewTagList } from './components/sidebar/ReviewTagList';

// =============================================================================
// Stores
// =============================================================================
export { useReviewFilterStore } from './stores/useReviewFilterStore';
export type { ReviewGranularity } from './stores/useReviewFilterStore';

// =============================================================================
// Lib
// =============================================================================
export { TagDetailPage } from './components/tag-detail/TagDetailPage';
// prefetchReviewData / prefetchTagDetailData はサーバー専用（next/headers使用）。
// 各ファイルに import 'server-only' ガード済み。
export { prefetchReviewData } from './lib/prefetch';
export { prefetchTagDetailData } from './lib/prefetchTagDetail';
export {
  buildDailyReviewRedirectPath,
  buildWeeklyTagDetailPath,
  parseReviewGranularityParam,
} from './lib/route-normalization';

// ここにないものはfeature内部専用
