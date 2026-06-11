import type { EntryOrigin, TimeRange } from '@dayopt/domain';
import { determineEntryOrigin as determineDomainEntryOrigin } from '@dayopt/domain';

export type { TimeRange } from '@dayopt/domain';

export type EntryLike = {
  origin?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  actual_start_time?: string | null;
  actual_end_time?: string | null;
  duration_minutes?: number | null;
  skipped_at?: string | null;
};

/** end <= now なら 'unplanned'、それ以外は 'planned'。now を注入できるのでテストが決定論的になる。 */
export function determineEntryOrigin(end: Date | string, now: Date = new Date()): EntryOrigin {
  return determineDomainEntryOrigin(new Date(end), now);
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

/** 計画したがやらなかった planned エントリかどうか。 */
export function isSkipped(entry: EntryLike): boolean {
  return entry.skipped_at != null;
}

/**
 * effective actual range（自動記録モデルの実績）。
 *
 * DB 側の唯一の定義は entries_effective view（supabase/migrations/
 * 20260610000000_entry_auto_record_model.sql）。本関数はその同義実装:
 * - actual が両方ある → その値（ユーザーが編集・確定した実績）
 * - planned かつ未スキップかつ end <= now → plan range（自動記録）
 * - それ以外（未来の planned / skipped）→ null（実績なし）
 */
export function getEffectiveActualRange(
  entry: EntryLike,
  now: Date = new Date(),
): TimeRange | null {
  const actual = getActualRange(entry);
  if (actual) return actual;

  if (entry.origin === 'planned' && !isSkipped(entry)) {
    const planned = getPlannedRange(entry);
    if (planned && planned.end.getTime() <= now.getTime()) return planned;
  }

  return null;
}

/** effective actual range が plan の自動転写（ユーザー未編集）かどうか。 */
export function isAutoRecorded(entry: EntryLike, now: Date = new Date()): boolean {
  return getActualRange(entry) === null && getEffectiveActualRange(entry, now) !== null;
}

/** effective actual 所要時間（分）。実績なし（未来・skipped）は null。 */
export function getEffectiveActualMinutes(entry: EntryLike, now: Date = new Date()): number | null {
  const range = getEffectiveActualRange(entry, now);
  if (!range) return null;
  return Math.round((range.end.getTime() - range.start.getTime()) / 60000);
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
