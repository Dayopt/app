import type { CalendarEvent } from '../types/calendar-event';
import type { TimeModelPlanDiffInput, TimeModelRecordDiffInput } from './timeblock-day-diff';

interface BuildDayDiffInputsOptions {
  /**
   * 各日の範囲。空配列なら常に visible とみなす（day view 相当、範囲チェックを省略する）。
   * 非連続な複数日（週末非表示の週など）を表現するため、単一の開始/終了ではなく日ごとの配列を取る。
   */
  dayBounds: readonly { dayStart: Date; dayEnd: Date }[];
  isEntryVisible: (activityId: string | null) => boolean;
}

function isWithinDayBounds(
  start: Date,
  end: Date,
  dayBounds: readonly { dayStart: Date; dayEnd: Date }[],
): boolean {
  if (dayBounds.length === 0) return true;
  return dayBounds.some((bounds) => start < bounds.dayEnd && end > bounds.dayStart);
}

/**
 * `CalendarEvent[]` から `computeTimeblockDayDiffs` 用の Plan 入力を組み立てる。
 *
 * 範囲外・非表示アクティビティの Plan も、表示中 Record の関係解決には残す
 * （`isIncludedInDiff: false` として弾く。計上はしないが関連付けは保つ）。
 */
export function buildTimeblockDayDiffPlans(
  entries: readonly CalendarEvent[],
  options: BuildDayDiffInputsOptions,
): TimeModelPlanDiffInput[] {
  const { dayBounds, isEntryVisible } = options;
  return entries
    .filter((entry) => entry.kind === 'plan')
    .map((entry) => {
      const startAt = entry.startDate ?? entry.displayStartDate;
      const endAt = entry.endDate ?? entry.displayEndDate;
      return {
        id: entry.id,
        title: entry.title,
        activityId: entry.activityId ?? null,
        color: entry.color,
        startAt,
        endAt,
        skippedAt: entry.isSkipped ? startAt : null,
        isIncludedInDiff:
          isEntryVisible(entry.activityId ?? null) && isWithinDayBounds(startAt, endAt, dayBounds),
      };
    });
}

/** `CalendarEvent[]` から `computeTimeblockDayDiffs` 用の Record 入力を組み立てる。 */
export function buildTimeblockDayDiffRecords(
  entries: readonly CalendarEvent[],
  options: BuildDayDiffInputsOptions,
): TimeModelRecordDiffInput[] {
  const { dayBounds, isEntryVisible } = options;
  return entries
    .filter((entry) => entry.kind === 'record' && isEntryVisible(entry.activityId ?? null))
    .map((entry) => ({
      id: entry.id,
      planId: entry.planId ?? null,
      title: entry.title,
      activityId: entry.activityId ?? null,
      color: entry.color,
      startAt: entry.startDate ?? entry.displayStartDate,
      endAt: entry.endDate ?? entry.displayEndDate,
    }))
    .filter((record) => isWithinDayBounds(record.startAt, record.endAt, dayBounds));
}
