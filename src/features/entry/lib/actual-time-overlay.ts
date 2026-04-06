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
  topDiffMin: number; // 差分の分数（符号付き: 正=遅れ, 負=早め）
  /** 下部: 終了差分（unexecuted=未実行で斜線, overtime=超過で左アクセント点線） */
  bottomKind: 'unexecuted' | 'overtime' | 'none';
  bottomHeight: number; // px
  bottomDiffMin: number; // 差分の分数（符号付き: 正=遅れ, 負=早め）
  /** カード位置の調整量 */
  topShift: number; // px（上に伸ばす分。正の値 = top を減算）
  heightDelta: number; // px（全体の追加高さ）
}

/** 差分の分数を Xmin / XhYm 形式にフォーマット（符号なし） */
export function formatDiffMinutes(minutes: number): string {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

/** 差分なし（デフォルト値） */
export const NO_OVERLAY: ActualTimeDiffOverlay = {
  topKind: 'none',
  topHeight: 0,
  topDiffMin: 0,
  bottomKind: 'none',
  bottomHeight: 0,
  bottomDiffMin: 0,
  topShift: 0,
  heightDelta: 0,
};

export function toMinutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

// =============================================================================
// 侵食（Encroachment）計算
// =============================================================================

/** 隣接エントリからの侵食情報 */
export interface Encroachment {
  /** 侵入元エントリのID */
  fromEntryId: string;
  /** 侵入元のタグID（表示時にタグカラーを resolve する） */
  fromTagId: string | null;
  /** 侵食方向: top = 上から（前のエントリの超過）, bottom = 下から（後のエントリの早い開始） */
  direction: 'top' | 'bottom';
  /** 侵食の高さ (px) */
  height: number;
  /** 侵食の時間 (分) */
  minutes: number;
}

/**
 * 対象エントリに対する隣接エントリからの侵食を計算
 *
 * 発生条件: 他エントリの actual 時間が対象エントリの予定枠に食い込んでいる場合
 * - top侵食: 前のエントリの actualEndDate > 対象の startDate
 * - bottom侵食: 後のエントリの actualStartDate < 対象の endDate
 */
export function computeEncroachments(
  target: CalendarEvent,
  allEntries: CalendarEvent[],
  hourHeight: number,
): Encroachment[] {
  if (!target.startDate || !target.endDate) return [];

  const targetStartMin = toMinutesOfDay(target.startDate);
  const targetEndMin = toMinutesOfDay(target.endDate);
  const minutesToPx = (minutes: number) => (Math.abs(minutes) * hourHeight) / 60;

  const encroachments: Encroachment[] = [];

  for (const other of allEntries) {
    if (other.id === target.id) continue;
    if (!other.startDate || !other.endDate) continue;

    const otherStartMin = toMinutesOfDay(other.startDate);

    // top侵食: 前のエントリ（予定が対象より前に始まる）の actual_end が対象の予定開始に食い込む
    if (otherStartMin < targetStartMin && other.actualEndDate) {
      const actualEndMin = toMinutesOfDay(other.actualEndDate);
      if (actualEndMin > targetStartMin) {
        const overlapMin = Math.min(actualEndMin, targetEndMin) - targetStartMin;
        if (overlapMin > 0) {
          encroachments.push({
            fromEntryId: other.id,
            fromTagId: other.tagId ?? null,
            direction: 'top',
            height: minutesToPx(overlapMin),
            minutes: overlapMin,
          });
        }
      }
    }

    // bottom侵食: 後のエントリ（予定が対象より後に始まる）の actual_start が対象の予定終了前に食い込む
    if (otherStartMin >= targetEndMin && other.actualStartDate) {
      const actualStartMin = toMinutesOfDay(other.actualStartDate);
      if (actualStartMin < targetEndMin) {
        const overlapMin = targetEndMin - Math.max(actualStartMin, targetStartMin);
        if (overlapMin > 0) {
          encroachments.push({
            fromEntryId: other.id,
            fromTagId: other.tagId ?? null,
            direction: 'bottom',
            height: minutesToPx(overlapMin),
            minutes: overlapMin,
          });
        }
      }
    }
  }

  return encroachments;
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

  return {
    topKind,
    topHeight,
    topDiffMin: startDiffMin,
    bottomKind,
    bottomHeight,
    bottomDiffMin: endDiffMin,
    topShift,
    heightDelta,
  };
}
