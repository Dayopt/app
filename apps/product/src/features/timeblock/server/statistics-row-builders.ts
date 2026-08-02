import 'server-only';

/**
 * 統計 service の純粋な集計ビルダー
 *
 * 取得済み rows から画面向けの集計行を組み立てる。DB 非依存。
 */

import { formatInTimeZone } from 'date-fns-tz';

import type { StatPlanRow, StatRecordRow, TagLookupRow } from './statistics-fetchers';
import { minutesBetween } from './statistics-service-grouping';
import type { TimePLResponse } from './statistics-shared';

function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

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

export function buildTagPL(
  plans: ReadonlyArray<StatPlanRow>,
  records: ReadonlyArray<StatRecordRow>,
  tagsById: ReadonlyMap<string, TagLookupRow>,
): TimePLResponse['tags'] {
  interface Accumulator {
    budget: number;
    actual: number;
    hasPlan: boolean;
  }
  const byTag = new Map<string | null, Accumulator>();

  for (const plan of plans) {
    const tagId = plan.tag_id != null && tagsById.has(plan.tag_id) ? plan.tag_id : null;
    const acc = byTag.get(tagId) ?? { budget: 0, actual: 0, hasPlan: false };
    acc.budget += minutesBetween(plan.start_at, plan.end_at);
    acc.hasPlan = true;
    byTag.set(tagId, acc);
  }
  for (const record of records) {
    const tagId = record.tag_id != null && tagsById.has(record.tag_id) ? record.tag_id : null;
    const acc = byTag.get(tagId) ?? { budget: 0, actual: 0, hasPlan: false };
    acc.actual += minutesBetween(record.start_at, record.end_at);
    byTag.set(tagId, acc);
  }

  return Array.from(byTag.entries())
    .filter(([, acc]) => acc.budget > 0 || acc.actual > 0)
    .map(([tagId, acc]) => {
      const tag = tagId == null ? undefined : tagsById.get(tagId);
      const isUncategorized = tag == null;
      return {
        tagId: isUncategorized ? null : tagId,
        tagName: isUncategorized ? null : (tag?.name ?? null),
        tagColor: isUncategorized ? null : (tag?.color ?? 'indigo'),
        tagIcon: isUncategorized ? null : (tag?.icon ?? null),
        budgetMinutes: roundTo1(acc.budget),
        actualMinutes: roundTo1(acc.actual),
        isPlanned: acc.hasPlan,
        isUncategorized,
      };
    })
    .sort((a, b) => b.actualMinutes - a.actualMinutes);
}
