interface TimePLDurationRow {
  /** 未分類（タグ削除で `tag_id = NULL` になった行）は null */
  tagId: string | null;
  minutes: number;
}

interface TimePLTagAggregate {
  tagId: string | null;
  plannedMinutes: number;
  recordedMinutes: number;
  hasPlan: boolean;
  hasRecord: boolean;
}

interface TimePLAccumulator {
  plannedMinutes: number;
  recordedMinutes: number;
  hasPlan: boolean;
  hasRecord: boolean;
}

/**
 * Plan / Record durationをtag別に加算し、各laneを0.1分へ丸める。
 *
 * `tagId` が null の行は単一の未分類バケットへ畳む（#1576: タグ削除で
 * Plan / Record が未分類化されるため、集計から落とさない）。
 */
export function aggregateTimePLTags(
  plans: ReadonlyArray<TimePLDurationRow>,
  records: ReadonlyArray<TimePLDurationRow>,
): TimePLTagAggregate[] {
  const totalsByTag = new Map<string | null, TimePLAccumulator>();
  accumulateRows(totalsByTag, plans, 'plannedMinutes', 'hasPlan');
  accumulateRows(totalsByTag, records, 'recordedMinutes', 'hasRecord');

  return Array.from(totalsByTag.entries()).map(([tagId, totals]) => ({
    tagId,
    plannedMinutes: roundToTenth(totals.plannedMinutes),
    recordedMinutes: roundToTenth(totals.recordedMinutes),
    hasPlan: totals.hasPlan,
    hasRecord: totals.hasRecord,
  }));
}

function accumulateRows(
  totalsByTag: Map<string | null, TimePLAccumulator>,
  rows: ReadonlyArray<TimePLDurationRow>,
  minutesField: 'plannedMinutes' | 'recordedMinutes',
  presenceField: 'hasPlan' | 'hasRecord',
): void {
  for (const row of rows) {
    const totals = totalsByTag.get(row.tagId) ?? {
      plannedMinutes: 0,
      recordedMinutes: 0,
      hasPlan: false,
      hasRecord: false,
    };
    totals[minutesField] += row.minutes;
    totals[presenceField] = true;
    totalsByTag.set(row.tagId, totals);
  }
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
