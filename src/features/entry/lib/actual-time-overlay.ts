/**
 * 予定 vs 記録 差分オーバーレイ計算
 *
 * Entry の actual_start/end と planned start/end の差分から
 * カレンダー表示用のオーバーレイ情報を計算する。
 * Entry ドメインのロジックのため features/entry に配置。
 */

import type { CalendarEvent } from '@/types/calendar-event';

/** 予定 vs 記録の差分オーバーレイ情報 */
export interface ActualTimeDiffOverlay {
  /** 上部: 開始差分（unexecuted=未実行で斜線, overtime=超過で左アクセント点線） */
  topKind: 'unexecuted' | 'overtime' | 'none';
  topHeight: number; // px
  /** 下部: 終了差分（unexecuted=未実行で斜線, overtime=超過で左アクセント点線） */
  bottomKind: 'unexecuted' | 'overtime' | 'none';
  bottomHeight: number; // px
  /** カード位置の調整量 */
  topShift: number; // px（上に伸ばす分。正の値 = top を減算）
  heightDelta: number; // px（全体の追加高さ）
}

/** 差分なし（デフォルト値） */
export const NO_OVERLAY: ActualTimeDiffOverlay = {
  topKind: 'none',
  topHeight: 0,
  bottomKind: 'none',
  bottomHeight: 0,
  topShift: 0,
  heightDelta: 0,
};

function toMinutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * 予定時間と実績時間の差分からオーバーレイ情報を計算
 *
 * 対象: actualStartDate または actualEndDate が1つ以上入力されている場合
 * （entryState に依存しない — actual time が入力されていれば常に差分を表示）
 * 未設定の方は予定通り（差分なし）として扱う
 */
export function computeActualTimeDiffOverlay(
  plan: CalendarEvent,
  hourHeight: number,
): ActualTimeDiffOverlay {
  if ((!plan.actualStartDate && !plan.actualEndDate) || !plan.startDate || !plan.endDate) {
    return NO_OVERLAY;
  }

  const plannedStartMin = toMinutesOfDay(plan.startDate);
  const plannedEndMin = toMinutesOfDay(plan.endDate);
  const actualStartMin = plan.actualStartDate
    ? toMinutesOfDay(plan.actualStartDate)
    : plannedStartMin;
  const actualEndMin = plan.actualEndDate ? toMinutesOfDay(plan.actualEndDate) : plannedEndMin;

  const minutesToPx = (minutes: number) => (Math.abs(minutes) * hourHeight) / 60;

  // --- 上部（開始差分） ---
  const startDiffMin = actualStartMin - plannedStartMin;
  let topKind: ActualTimeDiffOverlay['topKind'] = 'none';
  let topHeight = 0;
  let topShift = 0;

  if (startDiffMin > 0) {
    topKind = 'unexecuted';
    topHeight = minutesToPx(startDiffMin);
  } else if (startDiffMin < 0) {
    topKind = 'overtime';
    topHeight = minutesToPx(startDiffMin);
    topShift = topHeight;
  }

  // --- 下部（終了差分） ---
  const endDiffMin = actualEndMin - plannedEndMin;
  let bottomKind: ActualTimeDiffOverlay['bottomKind'] = 'none';
  let bottomHeight = 0;
  let heightDelta = topShift;

  if (endDiffMin < 0) {
    bottomKind = 'unexecuted';
    bottomHeight = minutesToPx(endDiffMin);
  } else if (endDiffMin > 0) {
    bottomKind = 'overtime';
    bottomHeight = minutesToPx(endDiffMin);
    heightDelta += bottomHeight;
  }

  return { topKind, topHeight, bottomKind, bottomHeight, topShift, heightDelta };
}
