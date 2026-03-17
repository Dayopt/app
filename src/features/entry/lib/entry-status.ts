/**
 * エントリの時間位置ベースの状態判定
 *
 * ステータスを手動管理せず、時間位置から自動判定する。
 * - upcoming: 未来の予定
 * - active: 現在進行中
 * - past: 過去の記録
 */

import type { EntryState } from '../types/entry';

type EntryLike = {
  start_time: string | null;
  end_time: string | null;
};

/**
 * エントリの時間位置から状態を判定
 *
 * @param entry - start_time, end_time を持つオブジェクト
 * @param now - 現在時刻（テスト用にオーバーライド可能）
 * @returns 'upcoming' | 'active' | 'past'
 */
export function getEntryState(entry: EntryLike, now?: Date): EntryState {
  const currentTime = now ?? new Date();

  if (!entry.start_time || !entry.end_time) {
    return 'upcoming';
  }

  const startTime = new Date(entry.start_time);
  const endTime = new Date(entry.end_time);

  if (startTime > currentTime) {
    return 'upcoming';
  }

  if (endTime > currentTime) {
    return 'active';
  }

  return 'past';
}

/**
 * エントリが過去かどうかを判定
 */
export function isEntryPast(entry: EntryLike, now?: Date): boolean {
  return getEntryState(entry, now) === 'past';
}
