type TimeModelDayDiffKind = 'recorded' | 'skipped' | 'unplanned' | 'unrecorded';

interface TimeModelPlanDiffInput {
  id: string;
  title: string;
  tagId: string | null;
  color: string;
  startAt: Date;
  endAt: Date;
  skippedAt: Date | null;
  deletedAt?: Date | null | undefined;
  /** false の Plan は関連判定にだけ使い、選択範囲の予定時間には含めない。 */
  isIncludedInDiff?: boolean | undefined;
}

interface TimeModelRecordDiffInput {
  id: string;
  planId: string | null;
  title: string;
  tagId: string | null;
  color: string;
  startAt: Date;
  endAt: Date;
}

interface TimeModelDayDiffItem {
  id: string;
  /** クリック時に開く Inspector 対象の id（recorded/skipped/unrecorded は plan、unplanned は record） */
  timeblockId: string;
  kind: TimeModelDayDiffKind;
  title: string;
  tagId: string | null;
  color: string;
  planId: string | null;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  plannedMinutes: number;
  actualMinutes: number;
  diffMinutes: number;
  /** ReviewDiffPanel の 'shifted' kind 専用フィールド。time model では常に 0（'shifted' を出さない） */
  startDiffMinutes: number;
  endDiffMinutes: number;
  sortTime: number;
}

interface TimeModelDayDiffResult {
  summary: {
    plannedMinutes: number;
    actualMinutes: number;
    diffMinutes: number;
    unplannedMinutes: number;
    /** time model に「未達成」の概念は無いため常に 0（ReviewDiffSummary の必須フィールドを満たすため保持） */
    missedMinutes: number;
    unrecordedMinutes: number;
  };
  items: TimeModelDayDiffItem[];
}

interface TimeModelDayDiffBounds {
  dayStart?: Date | null | undefined;
  dayEnd?: Date | null | undefined;
}

function clippedMinutes(start: Date, end: Date, bounds: TimeModelDayDiffBounds): number {
  const clippedStart = bounds.dayStart && start < bounds.dayStart ? bounds.dayStart : start;
  const clippedEnd = bounds.dayEnd && end > bounds.dayEnd ? bounds.dayEnd : end;
  return Math.max(0, Math.round((clippedEnd.getTime() - clippedStart.getTime()) / 60_000));
}

function buildRecordedItem(
  plan: TimeModelPlanDiffInput,
  linkedRecords: readonly TimeModelRecordDiffInput[],
  plannedMinutes: number,
  bounds: TimeModelDayDiffBounds,
): TimeModelDayDiffItem {
  const sortedLinkedRecords = [...linkedRecords].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime(),
  );
  const actualMinutes = sortedLinkedRecords.reduce(
    (total, record) => total + clippedMinutes(record.startAt, record.endAt, bounds),
    0,
  );
  const firstRecord = sortedLinkedRecords[0];
  const lastRecord = sortedLinkedRecords[sortedLinkedRecords.length - 1];

  return {
    id: `recorded:${plan.id}`,
    timeblockId: plan.id,
    kind: 'recorded',
    title: plan.title,
    tagId: plan.tagId,
    color: plan.color,
    planId: plan.id,
    plannedStart: plan.startAt,
    plannedEnd: plan.endAt,
    actualStart: firstRecord?.startAt ?? null,
    actualEnd: lastRecord?.endAt ?? null,
    plannedMinutes,
    actualMinutes,
    diffMinutes: actualMinutes - plannedMinutes,
    startDiffMinutes: 0,
    endDiffMinutes: 0,
    sortTime: firstRecord?.startAt.getTime() ?? plan.startAt.getTime(),
  };
}

/**
 * Step 7 の Plan / Record 1:N 差分。既存 entries ベースの day-diff とは並存し、Step 8 で接続する。
 * Record は Record 自身の日に、Plan は Plan 自身の日に集計される。
 */
export function computeTimeblockDayDiffs(
  plans: readonly TimeModelPlanDiffInput[],
  records: readonly TimeModelRecordDiffInput[],
  bounds: TimeModelDayDiffBounds = {},
): TimeModelDayDiffResult {
  const activePlans = plans.filter((plan) => plan.deletedAt == null);
  const plansById = new Map(activePlans.map((plan) => [plan.id, plan]));
  const recordsByPlanId = new Map<string, TimeModelRecordDiffInput[]>();
  const items: TimeModelDayDiffItem[] = [];
  let plannedMinutes = 0;
  let actualMinutes = 0;
  let unplannedMinutes = 0;
  let unrecordedMinutes = 0;

  for (const record of records) {
    const duration = clippedMinutes(record.startAt, record.endAt, bounds);
    if (duration === 0) continue;
    actualMinutes += duration;
    if (record.planId && plansById.has(record.planId)) {
      const linked = recordsByPlanId.get(record.planId) ?? [];
      linked.push(record);
      recordsByPlanId.set(record.planId, linked);
      continue;
    }
    unplannedMinutes += duration;
    items.push({
      id: `unplanned:${record.id}`,
      timeblockId: record.id,
      kind: 'unplanned',
      title: record.title,
      tagId: record.tagId,
      color: record.color,
      planId: null,
      plannedStart: null,
      plannedEnd: null,
      actualStart: record.startAt,
      actualEnd: record.endAt,
      plannedMinutes: 0,
      actualMinutes: duration,
      diffMinutes: duration,
      startDiffMinutes: 0,
      endDiffMinutes: 0,
      sortTime: record.startAt.getTime(),
    });
  }

  for (const plan of activePlans) {
    const duration =
      plan.isIncludedInDiff === false ? 0 : clippedMinutes(plan.startAt, plan.endAt, bounds);
    const linkedRecords = recordsByPlanId.get(plan.id) ?? [];
    if (duration === 0) {
      // Record は自身の日へ計上する。Plan が範囲外でも関係を保ち、予定外には落とさない。
      if (linkedRecords.length > 0) {
        items.push(buildRecordedItem(plan, linkedRecords, 0, bounds));
      }
      continue;
    }
    plannedMinutes += duration;
    if (plan.skippedAt) {
      items.push({
        id: `skipped:${plan.id}`,
        timeblockId: plan.id,
        kind: 'skipped',
        title: plan.title,
        tagId: plan.tagId,
        color: plan.color,
        planId: plan.id,
        plannedStart: plan.startAt,
        plannedEnd: plan.endAt,
        actualStart: null,
        actualEnd: null,
        plannedMinutes: duration,
        actualMinutes: 0,
        diffMinutes: -duration,
        startDiffMinutes: 0,
        endDiffMinutes: 0,
        sortTime: plan.startAt.getTime(),
      });
      continue;
    }

    if (linkedRecords.length === 0) {
      unrecordedMinutes += duration;
      items.push({
        id: `unrecorded:${plan.id}`,
        timeblockId: plan.id,
        kind: 'unrecorded',
        title: plan.title,
        tagId: plan.tagId,
        color: plan.color,
        planId: plan.id,
        plannedStart: plan.startAt,
        plannedEnd: plan.endAt,
        actualStart: null,
        actualEnd: null,
        plannedMinutes: duration,
        actualMinutes: 0,
        diffMinutes: -duration,
        startDiffMinutes: 0,
        endDiffMinutes: 0,
        sortTime: plan.startAt.getTime(),
      });
      continue;
    }

    items.push(buildRecordedItem(plan, linkedRecords, duration, bounds));
  }

  items.sort((a, b) => a.sortTime - b.sortTime || a.title.localeCompare(b.title));
  return {
    summary: {
      plannedMinutes,
      actualMinutes,
      diffMinutes: actualMinutes - plannedMinutes,
      unplannedMinutes,
      missedMinutes: 0,
      unrecordedMinutes,
    },
    items,
  };
}
