import 'server-only';

/**
 * 統計 service の純粋な集計ビルダー
 *
 * 取得済み rows から画面向けの集計行を組み立てる。DB 非依存。
 */

import { formatInTimeZone } from 'date-fns-tz';

import type { StatRecordRow, TagLookupRow } from './statistics-fetchers';
import { minutesBetween } from './statistics-service-grouping';

export function filterRowsByVisibleDateKeys<T extends { start_at: string }>(
  rows: readonly T[],
  visibleDateKeys: readonly string[] | undefined,
  timezone: string,
): T[] {
  if (!visibleDateKeys) return [...rows];

  const visibleDateKeySet = new Set(visibleDateKeys);
  return rows.filter((row) =>
    visibleDateKeySet.has(formatInTimeZone(new Date(row.start_at), timezone, 'yyyy-MM-dd')),
  );
}

export function buildOverviewSection(records: ReadonlyArray<StatRecordRow>) {
  const totalMinutes = records.reduce(
    (sum, record) => sum + minutesBetween(record.start_at, record.end_at),
    0,
  );
  const recordCount = records.length;
  const totalEntries = records.length;
  const plannedEntries = records.filter((record) => record.plan_id != null).length;
  return {
    totalMinutes,
    recordCount,
    totalEntries,
    plannedEntries,
    planRate: totalEntries > 0 ? plannedEntries / totalEntries : 0,
  };
}

export function buildTimeByTagRows(
  records: ReadonlyArray<StatRecordRow>,
  tagsById: ReadonlyMap<string, TagLookupRow>,
) {
  const minutesByTag = new Map<string | null, number>();
  for (const record of records) {
    const tagId = record.tag_id != null && tagsById.has(record.tag_id) ? record.tag_id : null;
    minutesByTag.set(
      tagId,
      (minutesByTag.get(tagId) ?? 0) + minutesBetween(record.start_at, record.end_at),
    );
  }
  return Array.from(minutesByTag.entries())
    .filter(([, minutes]) => minutes > 0)
    .map(([tagId, minutes]) => {
      const tag = tagId == null ? undefined : tagsById.get(tagId);
      const isUncategorized = tag == null;
      return {
        tag_id: isUncategorized ? null : tagId,
        tag_name: isUncategorized ? null : (tag?.name ?? null),
        tag_color: isUncategorized ? null : (tag?.color ?? 'indigo'),
        hours: minutes / 60,
        is_uncategorized: isUncategorized,
      };
    })
    .sort((a, b) => b.hours - a.hours);
}
