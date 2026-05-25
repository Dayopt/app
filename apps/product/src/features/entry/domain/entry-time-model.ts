import type { EntryOrigin } from '../types/entry';

export type EntryLike = {
  origin?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  actual_start_time?: string | null;
  actual_end_time?: string | null;
  duration_minutes?: number | null;
};

export type TimeRange = { start: Date; end: Date };

/** end <= now なら 'unplanned'、それ以外は 'planned'。now を注入できるのでテストが決定論的になる。 */
export function determineEntryOrigin(end: Date | string, now: Date = new Date()): EntryOrigin {
  return new Date(end).getTime() <= now.getTime() ? 'unplanned' : 'planned';
}

export function isPlannedEntry(entry: EntryLike): boolean {
  return entry.origin === 'planned';
}

export function isUnplannedEntry(entry: EntryLike): boolean {
  return entry.origin === 'unplanned';
}

export function getPlannedRange(entry: EntryLike): TimeRange | null {
  if (!entry.start_time || !entry.end_time) return null;
  return { start: new Date(entry.start_time), end: new Date(entry.end_time) };
}

export function getActualRange(entry: EntryLike): TimeRange | null {
  if (!entry.actual_start_time || !entry.actual_end_time) return null;
  return { start: new Date(entry.actual_start_time), end: new Date(entry.actual_end_time) };
}

/**
 * planned 所要時間（分）。
 * duration_minutes が保存済みなら優先、なければ planned range の差分から算出する。
 */
export function getPlannedMinutes(entry: EntryLike): number | null {
  const range = getPlannedRange(entry);
  if (!range) return null;
  return (
    entry.duration_minutes ?? Math.round((range.end.getTime() - range.start.getTime()) / 60000)
  );
}

/** actual 所要時間（分）。常に actual_start/actual_end から算出する。 */
export function getActualMinutes(entry: EntryLike): number | null {
  const range = getActualRange(entry);
  if (!range) return null;
  return Math.round((range.end.getTime() - range.start.getTime()) / 60000);
}

/** actual - planned（分）。正 = actual が長い、負 = actual が短い。どちらかがない場合は null。 */
export function getDiffMinutes(entry: EntryLike): number | null {
  const planned = getPlannedMinutes(entry);
  const actual = getActualMinutes(entry);
  if (planned === null || actual === null) return null;
  return actual - planned;
}

/** planned と actual に差分があるかどうか。 */
export function hasPlannedActualDiff(entry: EntryLike): boolean {
  const diff = getDiffMinutes(entry);
  return diff !== null && diff !== 0;
}
