import type { TimeRange } from './time-range';

export const entryOrigins = ['planned', 'unplanned'] as const;

export type EntryOrigin = (typeof entryOrigins)[number];

export type EntryState = 'upcoming' | 'active' | 'past';

export type FulfillmentScore = 1 | 2 | 3;

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

export function determineEntryOrigin(end: Date, now: Date = new Date()): EntryOrigin {
  return end.getTime() <= now.getTime() ? 'unplanned' : 'planned';
}
