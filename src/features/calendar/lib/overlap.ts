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
  return events.some((event) => {
    if (event.id === draggedEventId) return false;
    if (!event.startDate || !event.endDate) return false;

    // actual 時間が記録されている場合は実質的な占有範囲として使用
    const effectiveStart = event.actualStartDate ?? event.startDate;
    const effectiveEnd = event.actualEndDate ?? event.endDate;

    return effectiveStart < previewEndTime && effectiveEnd > previewStartTime;
  });
}
