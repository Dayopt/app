import { formatCalendarDateParam } from './date-param';

/**
 * `/report` へのパスを組む。
 *
 * 旧 `buildCalendarReviewPanelPath`（`/{locale}/{viewType}?panel=review&reviewTagId=`）
 * の後継。`/report` の期間契約は `?date=&range=` のみで `reviewTagId` を受けない
 * （docs/projects/workspace-shell-restructure/overview.md §6-3・§6-5）。タグ絞り込みの
 * 復元は Step 5（セグメント配線）で扱う。
 */
export function buildReportPath(locale: string, date: Date): string {
  const params = new URLSearchParams();
  params.set('date', formatCalendarDateParam(date));
  return `/${locale}/report?${params.toString()}`;
}
