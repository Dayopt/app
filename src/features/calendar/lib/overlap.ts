/**
 * 重複判定エンジン — React/DOM依存ゼロの純粋関数
 *
 * ドラッグ操作時のクライアント側重複チェックを提供。
 * 全エントリ間で重複を禁止する。
 */

import type { CalendarEvent } from '../types/calendar.types';

/**
 * クライアント側で時間重複をチェックする
 *
 * @param events - 全イベント
 * @param draggedEventId - ドラッグ中のイベントID
 * @param previewStartTime - プレビュー開始時刻
 * @param previewEndTime - プレビュー終了時刻
 * @returns 他のイベントと重複している場合true
 */
export function checkClientSideOverlap(
  events: CalendarEvent[],
  draggedEventId: string,
  previewStartTime: Date,
  previewEndTime: Date,
): boolean {
  if (previewEndTime.getTime() <= previewStartTime.getTime()) {
    return true;
  }

  const draggedEvent = events.find((event) => event.id === draggedEventId);
  const isNewFutureEntry = draggedEventId === '' && previewEndTime.getTime() > Date.now();
  const shouldCheckPlanned =
    isNewFutureEntry ||
    (draggedEvent?.origin === 'planned' && draggedEvent.entryState === 'upcoming');

  if (draggedEvent?.origin === 'unplanned' && previewEndTime.getTime() > Date.now()) {
    return true;
  }

  return events.some((event) => {
    if (event.id === draggedEventId) return false;

    const plannedStart =
      event.plannedStartDate ?? (event.origin === 'planned' ? event.startDate : null);
    const plannedEnd = event.plannedEndDate ?? (event.origin === 'planned' ? event.endDate : null);
    const actualStart = event.actualStartDate ?? event.startDate;
    const actualEnd = event.actualEndDate ?? event.endDate;

    if (
      shouldCheckPlanned &&
      plannedStart &&
      plannedEnd &&
      plannedStart < previewEndTime &&
      plannedEnd > previewStartTime
    ) {
      return true;
    }

    return !!(
      actualStart &&
      actualEnd &&
      actualStart < previewEndTime &&
      actualEnd > previewStartTime
    );
  });
}
