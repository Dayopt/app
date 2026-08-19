/**
 * Review Feature - Public API
 *
 * docs: docs/product/specs/review.md
 *
 * 振り返り機能のエントリポイント。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 *
 * `/report`（Composition Layer）が唯一の consumer。データ取得は Composition Layer が
 * timeblock（差分用）と自身の tRPC query（Time P/L 等）で行い、review はコンポーネントで
 * 受け取るだけ（overview.md §6-4・§6-9 #D）。
 *
 * ページ本体（`ReportBody`）は 1 export に保つ — セクションを個別 export すると
 * 分析の置き場が増える（§3-2 の歯止め）。`SegmentList` は Sidebar 側のコンテンツで
 * ページ本体の一部ではないため、この歯止めの対象外（Sidebar の CRUD 導線として別枠）。
 */

// =============================================================================
// Components
// =============================================================================
export { ReportBody } from './components/report/ReportBody';
export type { ReportDiffState } from './components/report/ReportBody';
export { SegmentList } from './components/segments/SegmentList';

// =============================================================================
// Lib（期間契約 — Composition Layer が `?date=&range=` から displayRange を組む）
// =============================================================================
export { buildReportDisplayRange } from './lib/compute-date-range';
export type { ReviewDisplayRange } from './lib/compute-date-range';
export type { ReviewGranularity } from './stores/useReviewFilterStore';

// ここにないものはfeature内部専用
