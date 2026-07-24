import 'server-only';

/**
 * 統計 service の純粋な集計ビルダー
 *
 * 取得済み rows から画面向けの集計行を組み立てる。DB 非依存。
 */

import { formatInTimeZone } from 'date-fns-tz';

import { aggregateTimePLTags } from '../domain';

import type { StatPlanRow, StatRecordRow, TagLookupRow } from './statistics-fetchers';
import { minutesBetween } from './statistics-service-grouping';
import type { TimePLResponse } from './statistics-shared';

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
  return aggregateTimePLTags(
    plans.flatMap((plan) =>
      plan.tag_id == null
        ? []
        : [{ tagId: plan.tag_id, minutes: minutesBetween(plan.start_at, plan.end_at) }],
    ),
    records.flatMap((record) =>
      record.tag_id == null
        ? []
        : [{ tagId: record.tag_id, minutes: minutesBetween(record.start_at, record.end_at) }],
    ),
  )
    .filter((aggregate) => aggregate.hasPlan || aggregate.hasRecord)
    .map((aggregate) => {
      const tag = tagsById.get(aggregate.tagId);
      return {
        tagId: aggregate.tagId,
        tagName: tag?.name ?? '',
        tagColor: tag?.color ?? 'indigo',
        tagIcon: tag?.icon ?? null,
        budgetMinutes: aggregate.plannedMinutes,
        actualMinutes: aggregate.recordedMinutes,
        isPlanned: aggregate.hasPlan,
      };
    })
    .sort((a, b) => b.actualMinutes - a.actualMinutes);
}
