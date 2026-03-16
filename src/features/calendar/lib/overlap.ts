/**
 * 重複判定エンジン — React/DOM依存ゼロの純粋関数
 *
 * ドラッグ操作時のクライアント側重複チェックを提供。
 *
 * 重複ルール:
 * - Plan↔Plan: 重複禁止
 * - Record↔Record: 重複禁止
 * - Plan↔Record: 共存可能（タイムボクシング × 時間記録の設計）
 */

import type { CalendarEvent } from '../types/calendar.types';

/**
 * イベントの起源を取得（planned or unplanned）
 *
 * planDataAdapter.getEventOrigin のインライン版。
 * engine層はutilsに依存しない。
 */
function getOrigin(
  event: Pick<CalendarEvent, 'origin'> | null | undefined,
): 'planned' | 'unplanned' {
  if (!event) return 'planned';
  return event.origin === 'unplanned' ? 'unplanned' : 'planned';
}

/**
 * クライアント側で時間重複をチェックする
 *
 * 同タイプ間のみ重複チェック:
 * - Plan↔Plan: 重複禁止
 * - Record↔Record: 重複禁止
 * - Plan↔Record: 共存可能
 *
 * @param events - 全イベント
 * @param draggedEventId - ドラッグ中のイベントID
 * @param previewStartTime - プレビュー開始時刻
 * @param previewEndTime - プレビュー終了時刻
 * @returns 同タイプのイベントと重複している場合true
 */
export function checkClientSideOverlap(
  events: CalendarEvent[],
  draggedEventId: string,
  previewStartTime: Date,
  previewEndTime: Date,
): boolean {
  const draggedEvent = events.find((e) => e.id === draggedEventId);
  if (!draggedEvent) return false;

  const draggedType = getOrigin(draggedEvent);

  return events.some((event) => {
    if (event.id === draggedEventId) return false;

    const eventType = getOrigin(event);
    if (eventType !== draggedType) return false;

    if (!event.startDate || !event.endDate) return false;

    return event.startDate < previewEndTime && event.endDate > previewStartTime;
  });
}
