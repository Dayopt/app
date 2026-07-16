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
  const minutesByTag = new Map<string, number>();
  for (const record of records) {
    if (record.tag_id == null) continue;
    minutesByTag.set(
      record.tag_id,
      (minutesByTag.get(record.tag_id) ?? 0) + minutesBetween(record.start_at, record.end_at),
    );
  }
  return Array.from(minutesByTag.entries())
    .filter(([, minutes]) => minutes > 0)
    .map(([tagId, minutes]) => {
      const tag = tagsById.get(tagId);
      return {
        tag_id: tagId,
        tag_name: tag?.name ?? '',
        tag_color: tag?.color ?? 'indigo',
        hours: minutes / 60,
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
  const byTag = new Map<string, Accumulator>();

  for (const plan of plans) {
    if (plan.tag_id == null) continue;
    const acc = byTag.get(plan.tag_id) ?? { budget: 0, actual: 0, hasPlan: false };
    acc.budget += minutesBetween(plan.start_at, plan.end_at);
    acc.hasPlan = true;
    byTag.set(plan.tag_id, acc);
  }
  for (const record of records) {
    if (record.tag_id == null) continue;
    const acc = byTag.get(record.tag_id) ?? { budget: 0, actual: 0, hasPlan: false };
    acc.actual += minutesBetween(record.start_at, record.end_at);
    byTag.set(record.tag_id, acc);
  }

  return Array.from(byTag.entries())
    .filter(([, acc]) => acc.budget > 0 || acc.actual > 0)
    .map(([tagId, acc]) => {
      const tag = tagsById.get(tagId);
      return {
        tagId,
        tagName: tag?.name ?? '',
        tagColor: tag?.color ?? 'indigo',
        tagIcon: tag?.icon ?? null,
        budgetMinutes: roundTo1(acc.budget),
        actualMinutes: roundTo1(acc.actual),
        isPlanned: acc.hasPlan,
      };
    })
    .sort((a, b) => b.actualMinutes - a.actualMinutes);
}
