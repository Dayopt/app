import type { CalendarEvent } from '../types/calendar.types';

export type CalendarDayDiffKind = 'unplanned' | 'missed' | 'shifted' | 'resized';

export interface CalendarDayDiffItem {
  id: string;
  entryId: string;
  kind: CalendarDayDiffKind;
  title: string;
  tagId: string | null;
  color: string;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  plannedMinutes: number;
  actualMinutes: number;
  diffMinutes: number;
  startDiffMinutes: number;
  endDiffMinutes: number;
  sortTime: number;
}

export interface CalendarDayDiffSummary {
  plannedMinutes: number;
  actualMinutes: number;
  diffMinutes: number;
  unplannedMinutes: number;
  missedMinutes: number;
}

export interface CalendarDayDiffResult {
  summary: CalendarDayDiffSummary;
  items: CalendarDayDiffItem[];
  entryIds: ReadonlySet<string>;
}

const EMPTY_RESULT: CalendarDayDiffResult = {
  summary: {
    plannedMinutes: 0,
    actualMinutes: 0,
    diffMinutes: 0,
    unplannedMinutes: 0,
    missedMinutes: 0,
  },
  items: [],
  entryIds: new Set<string>(),
};

function diffMinutes(start: Date | null | undefined, end: Date | null | undefined): number {
  if (!start || !end) return 0;
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.round(ms / 60_000);
}

function minutesBetween(a: Date | null, b: Date | null): number {
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

function plannedRange(entry: CalendarEvent): { start: Date | null; end: Date | null } {
  return {
    start: entry.plannedStartDate ?? entry.startDate,
    end: entry.plannedEndDate ?? entry.endDate,
  };
}

function actualRange(entry: CalendarEvent): { start: Date | null; end: Date | null } {
  if (entry.origin === 'unplanned') {
    return {
      start: entry.actualStartDate ?? entry.startDate,
      end: entry.actualEndDate ?? entry.endDate,
    };
  }

  const planned = plannedRange(entry);
  return {
    start: entry.actualStartDate && entry.actualEndDate ? entry.actualStartDate : planned.start,
    end: entry.actualStartDate && entry.actualEndDate ? entry.actualEndDate : planned.end,
  };
}

function makeItem(
  entry: CalendarEvent,
  kind: CalendarDayDiffKind,
  planned: { start: Date | null; end: Date | null },
  actual: { start: Date | null; end: Date | null },
): CalendarDayDiffItem {
  const plannedMinutes = diffMinutes(planned.start, planned.end);
  const actualMinutes = diffMinutes(actual.start, actual.end);

  return {
    id: `${kind}:${entry.id}`,
    entryId: entry.id,
    kind,
    title: entry.title,
    tagId: entry.tagId ?? null,
    color: entry.color,
    plannedStart: planned.start,
    plannedEnd: planned.end,
    actualStart: actual.start,
    actualEnd: actual.end,
    plannedMinutes,
    actualMinutes,
    diffMinutes: actualMinutes - plannedMinutes,
    startDiffMinutes: minutesBetween(planned.start, actual.start),
    endDiffMinutes: minutesBetween(planned.end, actual.end),
    sortTime: (actual.start ?? planned.start ?? entry.displayStartDate).getTime(),
  };
}

export function computeCalendarDayDiffs(
  entries: readonly CalendarEvent[],
  _now: Date = new Date(),
): CalendarDayDiffResult {
  if (entries.length === 0) return EMPTY_RESULT;

  const items: CalendarDayDiffItem[] = [];
  let plannedMinutes = 0;
  let actualMinutes = 0;
  let unplannedMinutes = 0;
  let missedMinutes = 0;

  for (const entry of entries) {
    if (entry.isDraft) continue;

    const planned = plannedRange(entry);
    const actual = actualRange(entry);
    const plannedDuration = diffMinutes(planned.start, planned.end);
    const actualDuration = diffMinutes(actual.start, actual.end);
    const countedActualDuration = entry.isSkipped === true ? 0 : actualDuration;

    if (entry.origin !== 'unplanned') {
      plannedMinutes += plannedDuration;
    }
    actualMinutes += countedActualDuration;

    if (entry.origin === 'unplanned') {
      if (actualDuration > 0) {
        unplannedMinutes += actualDuration;
        items.push(makeItem(entry, 'unplanned', { start: null, end: null }, actual));
      }
      continue;
    }

    const hasActual = actual.start != null && actual.end != null && actualDuration > 0;
    const missed = entry.isSkipped === true;

    if (missed) {
      missedMinutes += plannedDuration;
      items.push(makeItem(entry, 'missed', planned, { start: null, end: null }));
      continue;
    }

    if (!hasActual) continue;

    const startDiffMinutes = minutesBetween(planned.start, actual.start);
    const endDiffMinutes = minutesBetween(planned.end, actual.end);
    const durationDiffMinutes = actualDuration - plannedDuration;

    if (startDiffMinutes === 0 && endDiffMinutes === 0 && durationDiffMinutes === 0) {
      continue;
    }

    const kind: CalendarDayDiffKind = startDiffMinutes === 0 ? 'resized' : 'shifted';
    items.push(makeItem(entry, kind, planned, actual));
  }

  items.sort((a, b) => a.sortTime - b.sortTime || a.title.localeCompare(b.title));

  const entryIds = new Set(items.map((item) => item.entryId));

  return {
    summary: {
      plannedMinutes,
      actualMinutes,
      diffMinutes: actualMinutes - plannedMinutes,
      unplannedMinutes,
      missedMinutes,
    },
    items,
    entryIds,
  };
}
