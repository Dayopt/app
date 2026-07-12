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
}

interface TimeModelLogDiffInput {
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
  /** クリック時に開く Inspector 対象の id（recorded/skipped/unrecorded は plan、unplanned は log） */
  entryId: string;
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

/**
 * Step 7 の Plan / Log 1:N 差分。既存 entries ベースの day-diff とは並存し、Step 8 で接続する。
 * Log は Log 自身の日に、Plan は Plan 自身の日に集計される。
 */
export function computeTimeblockDayDiffs(
  plans: readonly TimeModelPlanDiffInput[],
  logs: readonly TimeModelLogDiffInput[],
  bounds: TimeModelDayDiffBounds = {},
): TimeModelDayDiffResult {
  const activePlans = plans.filter((plan) => plan.deletedAt == null);
  const plansById = new Map(activePlans.map((plan) => [plan.id, plan]));
  const logsByPlanId = new Map<string, TimeModelLogDiffInput[]>();
  const items: TimeModelDayDiffItem[] = [];
  let plannedMinutes = 0;
  let actualMinutes = 0;
  let unplannedMinutes = 0;
  let unrecordedMinutes = 0;

  for (const log of logs) {
    const duration = clippedMinutes(log.startAt, log.endAt, bounds);
    if (duration === 0) continue;
    actualMinutes += duration;
    if (log.planId && plansById.has(log.planId)) {
      const linked = logsByPlanId.get(log.planId) ?? [];
      linked.push(log);
      logsByPlanId.set(log.planId, linked);
      continue;
    }
    unplannedMinutes += duration;
    items.push({
      id: `unplanned:${log.id}`,
      entryId: log.id,
      kind: 'unplanned',
      title: log.title,
      tagId: log.tagId,
      color: log.color,
      planId: null,
      plannedStart: null,
      plannedEnd: null,
      actualStart: log.startAt,
      actualEnd: log.endAt,
      plannedMinutes: 0,
      actualMinutes: duration,
      diffMinutes: duration,
      startDiffMinutes: 0,
      endDiffMinutes: 0,
      sortTime: log.startAt.getTime(),
    });
  }

  for (const plan of activePlans) {
    const duration = clippedMinutes(plan.startAt, plan.endAt, bounds);
    if (duration === 0) continue;
    plannedMinutes += duration;
    if (plan.skippedAt) {
      items.push({
        id: `skipped:${plan.id}`,
        entryId: plan.id,
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

    const linkedLogs = logsByPlanId.get(plan.id) ?? [];
    if (linkedLogs.length === 0) {
      unrecordedMinutes += duration;
      items.push({
        id: `unrecorded:${plan.id}`,
        entryId: plan.id,
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

    const linkedMinutes = linkedLogs.reduce(
      (total, log) => total + clippedMinutes(log.startAt, log.endAt, bounds),
      0,
    );
    const sortedLinkedLogs = [...linkedLogs].sort(
      (a, b) => a.startAt.getTime() - b.startAt.getTime(),
    );
    items.push({
      id: `recorded:${plan.id}`,
      entryId: plan.id,
      kind: 'recorded',
      title: plan.title,
      tagId: plan.tagId,
      color: plan.color,
      planId: plan.id,
      plannedStart: plan.startAt,
      plannedEnd: plan.endAt,
      actualStart: sortedLinkedLogs[0]?.startAt ?? null,
      actualEnd: sortedLinkedLogs[sortedLinkedLogs.length - 1]?.endAt ?? null,
      plannedMinutes: duration,
      actualMinutes: linkedMinutes,
      diffMinutes: linkedMinutes - duration,
      startDiffMinutes: 0,
      endDiffMinutes: 0,
      sortTime: plan.startAt.getTime(),
    });
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
