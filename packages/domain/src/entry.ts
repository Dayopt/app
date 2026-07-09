import type { TimeRange } from './time-range';

export const entryOrigins = ['planned', 'unplanned'] as const;
export const planSources = ['manual', 'external_calendar', 'api'] as const;
export const logSources = [
  'manual',
  'from_plan',
  'auto_migrated',
  'external_calendar',
  'api',
] as const;

export type EntryOrigin = (typeof entryOrigins)[number];
export type PlanSource = (typeof planSources)[number];
export type LogSource = (typeof logSources)[number];

export type EntryState = 'upcoming' | 'active' | 'past';

export type EntryTimeRangeKind = 'planned' | 'actual';

export type EntryTimeRanges = Readonly<{
  planned?: TimeRange | null;
  actual?: TimeRange | null;
}>;

export type EntryTimeRangePatch = Readonly<{
  kind: EntryTimeRangeKind;
  range: TimeRange;
}>;

export function isEntryOrigin(value: string): value is EntryOrigin {
  return entryOrigins.includes(value as EntryOrigin);
}

export function isPlanSource(value: string): value is PlanSource {
  return planSources.includes(value as PlanSource);
}

export function isLogSource(value: string): value is LogSource {
  return logSources.includes(value as LogSource);
}

export function determineEntryOrigin(end: Date, now: Date = new Date()): EntryOrigin {
  return end.getTime() <= now.getTime() ? 'unplanned' : 'planned';
}
