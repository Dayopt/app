/**
 * Review Feature - Public API
 *
 * docs: docs/product/specs/review.md
 *
 * 振り返り機能のエントリポイント。
 * 内部モジュールへの直接参照（deep import）は避け、ここからのみ import すること。
 *
 * `/report`（Composition Layer）が唯一の consumer。期間の正本は URL（`?date=&range=`）で、
 * Composition Layer が解析して渡す。集計は review 自身の tRPC query が行う。
 *
 * ページ本体（`ReportBody`）は 1 export に保つ — 章を個別 export すると分析の置き場が
 * 増える。`SegmentList` は Sidebar 側のコンテンツでページ本体の一部ではないため、この
 * 歯止めの対象外（Sidebar の内容として別枠）。`ReportFilterList` も同じ枠。
 */

// =============================================================================
// Components
// =============================================================================
export { ReportHeader } from './components/layout/ReportHeader';
export { ReportBody } from './components/report/ReportBody';
export { SegmentList } from './components/segments/SegmentList';
export { ReportFilterList } from './components/sidebar/ReportFilterList';

// =============================================================================
// Lib（期間契約 — Composition Layer が `?date=&range=` から期間を組む）
// =============================================================================
export {
  isReportGranularity,
  resolveNextPeriodStartDayKey,
  resolveReportRange,
  shiftReportAnchor,
  todayReportAnchor,
} from './lib/report-period';
export type { ReportGranularity } from './lib/report-period';

// ここにないものはfeature内部専用
