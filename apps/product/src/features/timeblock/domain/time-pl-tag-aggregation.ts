interface TimePLDurationRow {
  tagId: string;
  minutes: number;
}

interface TimePLTagAggregate {
  tagId: string;
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

/** Plan / Record durationをtag別に加算し、各laneを0.1分へ丸める。 */
export function aggregateTimePLTags(
  plans: ReadonlyArray<TimePLDurationRow>,
  records: ReadonlyArray<TimePLDurationRow>,
): TimePLTagAggregate[] {
  const totalsByTag = new Map<string, TimePLAccumulator>();
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
  totalsByTag: Map<string, TimePLAccumulator>,
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
