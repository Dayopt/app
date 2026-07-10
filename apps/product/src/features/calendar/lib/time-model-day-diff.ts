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
  kind: TimeModelDayDiffKind;
  title: string;
  tagId: string | null;
  color: string;
  planId: string | null;
  plannedMinutes: number;
  actualMinutes: number;
  diffMinutes: number;
  sortTime: number;
}

interface TimeModelDayDiffResult {
  summary: {
    plannedMinutes: number;
    actualMinutes: number;
    diffMinutes: number;
    unplannedMinutes: number;
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
export function computeTimeModelDayDiffs(
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
      kind: 'unplanned',
      title: log.title,
      tagId: log.tagId,
      color: log.color,
      planId: null,
      plannedMinutes: 0,
      actualMinutes: duration,
      diffMinutes: duration,
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
        kind: 'skipped',
        title: plan.title,
        tagId: plan.tagId,
        color: plan.color,
        planId: plan.id,
        plannedMinutes: duration,
        actualMinutes: 0,
        diffMinutes: -duration,
        sortTime: plan.startAt.getTime(),
      });
      continue;
    }

    const linkedLogs = logsByPlanId.get(plan.id) ?? [];
    if (linkedLogs.length === 0) {
      unrecordedMinutes += duration;
      items.push({
        id: `unrecorded:${plan.id}`,
        kind: 'unrecorded',
        title: plan.title,
        tagId: plan.tagId,
        color: plan.color,
        planId: plan.id,
        plannedMinutes: duration,
        actualMinutes: 0,
        diffMinutes: -duration,
        sortTime: plan.startAt.getTime(),
      });
      continue;
    }

    const linkedMinutes = linkedLogs.reduce(
      (total, log) => total + clippedMinutes(log.startAt, log.endAt, bounds),
      0,
    );
    items.push({
      id: `recorded:${plan.id}`,
      kind: 'recorded',
      title: plan.title,
      tagId: plan.tagId,
      color: plan.color,
      planId: plan.id,
      plannedMinutes: duration,
      actualMinutes: linkedMinutes,
      diffMinutes: linkedMinutes - duration,
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
      unrecordedMinutes,
    },
    items,
  };
}
