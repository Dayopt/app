/**
 * エントリの時間位置ベースの状態判定
 *
 * ステータスを手動管理せず、時間位置から自動判定する。
 * - upcoming: 未来の予定
 * - active: 現在進行中
 * - past: 過去の記録
 */

import type { TimeblockState } from '@dayopt/domain';

type TimeblockLike = {
  origin?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  actual_start_time?: string | null;
  actual_end_time?: string | null;
};

/**
 * エントリの時間位置から状態を判定
 *
 * @param entry - start_time, end_time を持つオブジェクト
 * @param now - 現在時刻（テスト用にオーバーライド可能）
 * @returns 'upcoming' | 'active' | 'past'
 */
export function getTimeblockState(entry: TimeblockLike, now?: Date): TimeblockState {
  const currentTime = now ?? new Date();
  const plannedStart = entry.start_time ? new Date(entry.start_time) : null;
  const plannedEnd = entry.end_time ? new Date(entry.end_time) : null;
  const actualStart = entry.actual_start_time ? new Date(entry.actual_start_time) : null;
  const actualEnd = entry.actual_end_time ? new Date(entry.actual_end_time) : null;

  if (entry.origin === 'unplanned') {
    if (!actualStart || !actualEnd) return 'upcoming';
    if (actualStart > currentTime) return 'upcoming';
    return actualEnd > currentTime ? 'active' : 'past';
  }

  if (!plannedStart || !plannedEnd) {
    return 'upcoming';
  }

  const plannedIsActive = plannedStart <= currentTime && currentTime < plannedEnd;
  const actualIsActive =
    actualStart != null &&
    actualEnd != null &&
    actualStart <= currentTime &&
    currentTime < actualEnd;
  if (plannedIsActive || actualIsActive) {
    return 'active';
  }

  if (plannedStart > currentTime) {
    return 'upcoming';
  }

  return 'past';
}

/**
 * エントリが過去かどうかを判定
 */
export function isTimeblockPast(entry: TimeblockLike, now?: Date): boolean {
  return getTimeblockState(entry, now) === 'past';
}
