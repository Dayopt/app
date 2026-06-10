/**
 * 重複判定エンジン — React/DOM依存ゼロの純粋関数
 *
 * ドラッグ操作時のクライアント側重複チェックを提供。
 * 全エントリ間で重複を禁止する。
 */

import { hasTwoLayerTimeConflict, type TwoLayerOverlapTarget } from '@/lib/time/two-layer-overlap';
import type { CalendarEvent } from '../types/calendar.types';
import { hasCalendarActualRangeDiff } from './entry-time';

export type CalendarInteractionOperation = 'drag' | 'resize';

function shiftDate(date: Date, deltaMs: number): Date {
  return new Date(date.getTime() + deltaMs);
}

export function buildInteractionOverlapTarget(
  event: CalendarEvent,
  previewStartTime: Date,
  previewEndTime: Date,
  operation: CalendarInteractionOperation,
  now: number = Date.now(),
): TwoLayerOverlapTarget {
  if (event.origin === 'unplanned') {
    return {
      id: event.id,
      plannedStart: null,
      plannedEnd: null,
      actualStart: previewStartTime,
      actualEnd: previewEndTime,
      forbidFutureActual: true,
      now,
    };
  }

  const hasActualRange = event.actualStartDate != null && event.actualEndDate != null;
  if (!hasActualRange) {
    return {
      id: event.id,
      plannedStart: previewStartTime,
      plannedEnd: previewEndTime,
      actualStart: null,
      actualEnd: null,
      allowMissingActual: true,
    };
  }

  if (hasCalendarActualRangeDiff(event)) {
    if (operation === 'resize') {
      return {
        id: event.id,
        plannedStart: previewStartTime,
        plannedEnd: previewEndTime,
        actualStart: event.actualStartDate,
        actualEnd: event.actualEndDate,
      };
    }

    const plannedStart = event.plannedStartDate ?? event.startDate;
    const deltaMs = plannedStart ? previewStartTime.getTime() - plannedStart.getTime() : 0;
    return {
      id: event.id,
      plannedStart: previewStartTime,
      plannedEnd: previewEndTime,
      actualStart: shiftDate(event.actualStartDate!, deltaMs),
      actualEnd: shiftDate(event.actualEndDate!, deltaMs),
    };
  }

  return {
    id: event.id,
    plannedStart: previewStartTime,
    plannedEnd: previewEndTime,
    actualStart: previewStartTime,
    actualEnd: previewEndTime,
  };
}

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
  operation: CalendarInteractionOperation = 'drag',
): boolean {
  const now = Date.now();
  const draggedEvent = events.find((event) => event.id === draggedEventId);
  // 保存時と同じ規則で planned / actual の操作後rangeを組み立てる。
  // drag はactual差分を平行移動し、resizeは差分があるactualを固定する。
  const target =
    draggedEventId === ''
      ? buildNewEntryOverlapTarget(previewStartTime, previewEndTime, now)
      : draggedEvent
        ? buildInteractionOverlapTarget(
            draggedEvent,
            previewStartTime,
            previewEndTime,
            operation,
            now,
          )
        : {
            id: draggedEventId,
            plannedStart: previewStartTime,
            plannedEnd: previewEndTime,
            actualStart: previewStartTime,
            actualEnd: previewEndTime,
          };

  return hasTwoLayerTimeConflict(
    events.map((event) => {
      const plannedStart =
        event.plannedStartDate ?? (event.origin === 'planned' ? event.startDate : null);
      const plannedEnd =
        event.plannedEndDate ?? (event.origin === 'planned' ? event.endDate : null);
      const actualStart =
        event.actualStartDate === undefined
          ? event.startDate
          : (event.actualStartDate ?? (event.origin === 'unplanned' ? event.startDate : null));
      const actualEnd =
        event.actualEndDate === undefined
          ? event.endDate
          : (event.actualEndDate ?? (event.origin === 'unplanned' ? event.endDate : null));

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
