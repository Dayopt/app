/**
 * 重複判定エンジン — React/DOM依存ゼロの純粋関数
 *
 * ドラッグ操作時のクライアント側重複チェックを提供。
 * 全エントリ間で重複を禁止する。
 */

import { hasTwoLayerTimeConflict, type TwoLayerOverlapTarget } from '@/lib/time/two-layer-overlap';
import type { CalendarEvent } from '../types/calendar.types';

export function buildNewEntryOverlapTarget(
  startTime: Date,
  endTime: Date,
  now: number = Date.now(),
): TwoLayerOverlapTarget {
  const willBeUnplanned = endTime.getTime() <= now;

  return {
    id: '',
    plannedStart: willBeUnplanned ? null : startTime,
    plannedEnd: willBeUnplanned ? null : endTime,
    actualStart: startTime,
    actualEnd: endTime,
  };
}

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
  // planned entry は upcoming だけでなく active 状態でも planned 範囲を持つので
  // 移動先の planned 範囲 overlap を check する。
  // (サーバー側 ensureNoOverlaps も `origin === 'planned'` で planned 重複を検証する。
  //  client 側で skip すると server 拒否で snap-back / TIME_OVERLAP toast が出るため UX が悪化する)
  const shouldCheckPlanned = draggedEvent?.origin === 'planned';
  const target =
    draggedEventId === ''
      ? buildNewEntryOverlapTarget(previewStartTime, previewEndTime, now)
      : {
          id: draggedEventId,
          plannedStart: shouldCheckPlanned ? previewStartTime : null,
          plannedEnd: shouldCheckPlanned ? previewEndTime : null,
          actualStart: previewStartTime,
          actualEnd: previewEndTime,
          forbidFutureActual: draggedEvent?.origin === 'unplanned',
          now,
        };

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
    target,
  );
}
