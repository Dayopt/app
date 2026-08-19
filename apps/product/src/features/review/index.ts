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
 * 受け取るだけ（overview.md §6-4・§6-9 #D）。公開コンポーネントを 1 つに保つ —
 * セクションを個別 export すると分析の置き場が増える（§3-2 の歯止め）。
 */

// =============================================================================
// Components
// =============================================================================
export { ReportBody } from './components/report/ReportBody';
export type { ReportDiffState } from './components/report/ReportBody';

// =============================================================================
// Lib（期間契約 — Composition Layer が `?date=&range=` から displayRange を組む）
// =============================================================================
export { buildReportDisplayRange } from './lib/compute-date-range';
export type { ReviewDisplayRange } from './lib/compute-date-range';
export type { ReviewGranularity } from './stores/useReviewFilterStore';

// ここにないものはfeature内部専用
