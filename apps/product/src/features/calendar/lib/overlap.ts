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

  // 自動記録モデル: 未来の planned は actual NULL で作成されるため
  // planned レイヤーだけを占有する。unplanned は actual レイヤーのみ。
  return {
    id: '',
    plannedStart: willBeUnplanned ? null : startTime,
    plannedEnd: willBeUnplanned ? null : endTime,
    actualStart: willBeUnplanned ? startTime : null,
    actualEnd: willBeUnplanned ? endTime : null,
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

  // ドラッグ対象が実績レイヤーで占有する range（effective actual）:
  // - unplanned: 移動先 = actual
  // - planned で actual 確定済み: plan の移動は actual を動かさない → actual レイヤーは不変（null）
  // - planned で actual 未編集・未スキップ: 移動先が過去なら自動記録として actual レイヤーを占有
  const hasConfirmedActual = draggedEvent?.actualStartDate != null;
  const previewIsPast = previewEndTime.getTime() <= now;
  const plannedOccupiesActual =
    shouldCheckPlanned && !hasConfirmedActual && !draggedEvent?.isSkipped && previewIsPast;
  const targetActualStart = shouldCheckPlanned
    ? plannedOccupiesActual
      ? previewStartTime
      : null
    : previewStartTime;
  const targetActualEnd = shouldCheckPlanned
    ? plannedOccupiesActual
      ? previewEndTime
      : null
    : previewEndTime;

  const target =
    draggedEventId === ''
      ? buildNewEntryOverlapTarget(previewStartTime, previewEndTime, now)
      : {
          id: draggedEventId,
          plannedStart: shouldCheckPlanned ? previewStartTime : null,
          plannedEnd: shouldCheckPlanned ? previewEndTime : null,
          actualStart: targetActualStart,
          actualEnd: targetActualEnd,
          forbidFutureActual: draggedEvent?.origin === 'unplanned',
          now,
        };

  return hasTwoLayerTimeConflict(
    events.map((event) => toOverlapEntry(event, now)),
    target,
  );
}

/**
 * CalendarEvent を重複判定用の2レイヤー表現に変換する。
 * actual レイヤーは effective actual（確定済み actual、なければ過去 planned の自動記録）。
 */
function toOverlapEntry(event: CalendarEvent, now: number) {
  const plannedStart =
    event.plannedStartDate ?? (event.origin === 'planned' ? event.startDate : null);
  const plannedEnd = event.plannedEndDate ?? (event.origin === 'planned' ? event.endDate : null);

  const isAutoRecorded =
    event.origin === 'planned' &&
    event.actualStartDate == null &&
    !event.isSkipped &&
    plannedEnd != null &&
    plannedEnd.getTime() <= now;

  const fallbackActualStart =
    event.origin === 'unplanned' ? event.startDate : isAutoRecorded ? plannedStart : null;
  const fallbackActualEnd =
    event.origin === 'unplanned' ? event.endDate : isAutoRecorded ? plannedEnd : null;

  return {
    id: event.id,
    plannedStart,
    plannedEnd,
    actualStart: event.actualStartDate ?? fallbackActualStart,
    actualEnd: event.actualEndDate ?? fallbackActualEnd,
  };
}
