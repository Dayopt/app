/**
 * 重複判定エンジン — React/DOM依存ゼロの純粋関数
 *
 * ドラッグ操作時のクライアント側重複チェックを提供。
 * 全エントリ間で重複を禁止する。
 */

import { hasTwoLayerTimeConflict } from '@/lib/time/two-layer-overlap';
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
  const now = Date.now();
  const draggedEvent = events.find((event) => event.id === draggedEventId);
  const isNewFutureEntry = draggedEventId === '' && previewEndTime.getTime() > now;
  const shouldCheckPlanned =
    isNewFutureEntry ||
    (draggedEvent?.origin === 'planned' && draggedEvent.entryState === 'upcoming');

  return hasTwoLayerTimeConflict(
    events.map((event) => {
      const plannedStart =
        event.plannedStartDate ?? (event.origin === 'planned' ? event.startDate : null);
      const plannedEnd =
        event.plannedEndDate ?? (event.origin === 'planned' ? event.endDate : null);
      const actualStart = event.actualStartDate ?? event.startDate;
      const actualEnd = event.actualEndDate ?? event.endDate;

      return {
        id: event.id,
        plannedStart,
        plannedEnd,
        actualStart,
        actualEnd,
      };
    }),
    {
      id: draggedEventId,
      plannedStart: shouldCheckPlanned ? previewStartTime : null,
      plannedEnd: shouldCheckPlanned ? previewEndTime : null,
      actualStart: previewStartTime,
      actualEnd: previewEndTime,
      forbidFutureActual: draggedEvent?.origin === 'unplanned',
      now,
    },
  );
}
