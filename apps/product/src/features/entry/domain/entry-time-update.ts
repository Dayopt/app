/**
 * Entry 時間更新ルール — drag / resize / undo 時にどのフィールドを書き換えるかの policy
 *
 * `entry-time-model.ts` は read 系（origin 判定、range 取得、duration 計算）に閉じる。
 * このファイルは write 系（mutation 用 patch 構築）を担う。
 *
 * 全関数は React / tRPC / Zustand / DOM 非依存の純粋関数。Calendar / Inspector など
 * caller を問わず一貫したルールで `entries.update` の payload を組み立てるために使う。
 */

import type { EntryLike } from './entry-time-model';

/** `entries.update` mutation に渡せる時間関連フィールドの部分集合。 */
type EntryTimeUpdateData = {
  start_time?: string | null;
  end_time?: string | null;
  actual_start_time?: string | null;
  actual_end_time?: string | null;
};

/** 2 つの時刻 range（ISO 文字列の組）が完全一致するか。null/undefined もそのまま比較する。 */
export function rangesMatch(
  firstStart: string | null | undefined,
  firstEnd: string | null | undefined,
  secondStart: string | null | undefined,
  secondEnd: string | null | undefined,
): boolean {
  return firstStart === secondStart && firstEnd === secondEnd;
}

/**
 * planned origin の entry で、ユーザーが確定した actual range が planned range と
 * **異なっている**かどうか。
 *
 * 自動記録モデルでは actual NULL = 未編集（実績は plan に追従する自動記録）なので、
 * actual が無い場合は diff なしとして扱う。
 *
 * 注意: `hasPlannedActualDiff` (entry-time-model) は duration の差分を見ているのに対し、
 * こちらは ISO 文字列の完全一致を見る。同じ duration で時刻だけシフトしているケースは
 * `hasPlannedActualDiff` では false / こちらでは true になる。drag / resize 時に
 * 「planned を温存して actual だけ動かす」判断にはこちらの定義が必要。
 */
export function hasActualRangeDiff(entry: EntryLike | null | undefined): boolean {
  if (entry?.origin !== 'planned') return false;
  if (!entry.actual_start_time || !entry.actual_end_time) return false;
  return !rangesMatch(
    entry.start_time,
    entry.end_time,
    entry.actual_start_time,
    entry.actual_end_time,
  );
}

/**
 * Drag / resize / 新規作成時の時刻 patch を構築する。entry.origin と
 * actual range の状態に応じて、planned / actual の片方だけ更新するか両方更新するかを決める。
 *
 * ルール（自動記録モデル: actual NULL = 未編集、実績は plan に追従する）:
 * - `entry.origin === 'planned' && resetActualTime`: planned を新時刻にし、actual を NULL（未編集）に戻す
 * - `entry.origin === 'unplanned'`: actual だけ更新（planned は触らない）
 * - `entry.origin === 'planned'`: planned のみ更新（確定済み actual は保持、未編集 actual は NULL のまま）
 * - `entry` が null（新規）: planned range として渡す（origin はサーバーが時間位置から決定）
 * - その他（origin が不明など）: actual のみ更新
 */
export function buildTimeUpdateData(
  entry: EntryLike | null | undefined,
  startTime: Date,
  endTime: Date,
  resetActualTime = false,
): EntryTimeUpdateData {
  const startISO = startTime.toISOString();
  const endISO = endTime.toISOString();

  if (entry?.origin === 'planned' && resetActualTime) {
    return {
      start_time: startISO,
      end_time: endISO,
      actual_start_time: null,
      actual_end_time: null,
    };
  }

  if (entry?.origin === 'unplanned') {
    return {
      actual_start_time: startISO,
      actual_end_time: endISO,
    };
  }

  if (entry?.origin === 'planned' || !entry) {
    return {
      start_time: startISO,
      end_time: endISO,
    };
  }

  return {
    actual_start_time: startISO,
    actual_end_time: endISO,
  };
}

/**
 * `buildTimeUpdateData` の逆操作。直前の entry スナップショットから、Undo で書き戻すべき
 * 時刻 patch を構築する。元の時刻が一部欠けていて復元不可能な場合は null を返す。
 *
 * ルール（自動記録モデル: actual NULL も「未編集」という復元可能な状態）:
 * - `entry === null`: null（復元不可）
 * - `entry.origin === 'unplanned'`: 元の actual_start/end を書き戻す。欠落していれば null
 * - `resetActualTime === true` または planned: planned range と actual（NULL 含む）を書き戻す。
 *   planned range が欠落していれば null
 * - その他（origin 不明）: actual（NULL 含む）だけ書き戻す
 */
export function buildUndoTimeUpdateData(
  entry: EntryLike | null | undefined,
  resetActualTime = false,
): EntryTimeUpdateData | null {
  if (!entry) return null;

  if (entry.origin === 'unplanned') {
    if (!entry.actual_start_time || !entry.actual_end_time) return null;
    return {
      actual_start_time: entry.actual_start_time,
      actual_end_time: entry.actual_end_time,
    };
  }

  if (resetActualTime || entry.origin === 'planned') {
    if (!entry.start_time || !entry.end_time) return null;
    return {
      start_time: entry.start_time,
      end_time: entry.end_time,
      actual_start_time: entry.actual_start_time ?? null,
      actual_end_time: entry.actual_end_time ?? null,
    };
  }

  return {
    actual_start_time: entry.actual_start_time ?? null,
    actual_end_time: entry.actual_end_time ?? null,
  };
}
