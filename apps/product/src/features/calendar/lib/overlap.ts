/**
 * 重複判定エンジン — React/DOM依存ゼロの純粋関数
 *
 * ドラッグ操作時のクライアント側重複チェックを提供。
 * 全エントリ間で重複を禁止する。
 */

import { hasTwoLayerTimeConflict, type TwoLayerOverlapTarget } from '@dayopt/domain';
import type { QueryClient } from '@tanstack/react-query';
import type { CalendarEvent } from '../types/calendar.types';

// =============================================================================
// time model（plans / logs）のレーン別重複判定
// =============================================================================

/** plans.list / logs.list キャッシュ行のうち重複判定に必要な部分 */
interface TimeModelLaneItem {
  id: string;
  start_at: string;
  end_at: string;
}

/** 指定レーンの list キャッシュ query を判定する predicate（tRPC v11 key 形式） */
function isLaneListQuery(lane: 'plans' | 'logs') {
  return (query: { queryKey: unknown }): boolean => {
    const key = query.queryKey;
    return (
      Array.isArray(key) && Array.isArray(key[0]) && key[0][0] === lane && key[0][1] === 'list'
    );
  };
}

/** キャッシュ済みの plans.list / logs.list から重複判定用の行を id 重複なしで集める */
export function collectTimeModelLaneItems(
  queryClient: QueryClient,
  lane: 'plans' | 'logs',
): TimeModelLaneItem[] {
  const lists = queryClient.getQueriesData<TimeModelLaneItem[]>({
    predicate: isLaneListQuery(lane),
  });
  const seen = new Set<string>();
  const items: TimeModelLaneItem[] = [];
  for (const [, data] of lists) {
    if (!data) continue;
    for (const row of data) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      items.push(row);
    }
  }
  return items;
}

/**
 * 同一レーン内の時間重複を判定する（plan×plan / log×log のみ禁止、plan×log は許可）。
 * サーバーの TimeblockOverlapService と同じ半開区間判定（start < otherEnd && end > otherStart）。
 * skip 済み plan も占有として扱う（EXCLUDE 制約と同一視野）。
 */
export function hasTimeModelLaneConflict(
  items: TimeModelLaneItem[],
  startAt: Date,
  endAt: Date,
  excludeId?: string,
): boolean {
  const start = startAt.getTime();
  const end = endAt.getTime();
  return items.some(
    (item) =>
      item.id !== excludeId &&
      new Date(item.start_at).getTime() < end &&
      new Date(item.end_at).getTime() > start,
  );
}

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
 * ドラッグ/リサイズ中の kind-aware 重複判定（plan×plan / log×log のみ禁止、plan×log は許可）。
 * time model 化された CalendarEvent（`kind` 付き）専用。checkClientSideOverlap の
 * 旧二層判定（planned/actual layer）は log-with-plan を origin:'planned' として誤扱いするため、
 * ドラッグ移動先が同一 kind の他イベントと重ならないかだけを見るこちらに置き換える。
 */
export function checkClientSideOverlapByKind(
  events: CalendarEvent[],
  draggedEventId: string,
  previewStartTime: Date,
  previewEndTime: Date,
): boolean {
  const draggedEvent = events.find((event) => event.id === draggedEventId);
  const kind = draggedEvent?.kind ?? 'plan';
  const start = previewStartTime.getTime();
  const end = previewEndTime.getTime();

  return events.some((event) => {
    if (event.id === draggedEventId) return false;
    if ((event.kind ?? 'plan') !== kind) return false;
    const otherStart = (event.startDate ?? event.displayStartDate)?.getTime();
    const otherEnd = (event.endDate ?? event.displayEndDate)?.getTime();
    if (otherStart == null || otherEnd == null) return false;
    return otherStart < end && otherEnd > start;
  });
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
