export const timeblockOrigins = ['planned', 'unplanned'] as const;
export const planSources = ['manual', 'external_calendar', 'api'] as const;
export const recordSources = [
  'manual',
  'from_plan',
  'auto_migrated',
  'external_calendar',
  'api',
] as const;

export type TimeblockOrigin = (typeof timeblockOrigins)[number];
export type PlanSource = (typeof planSources)[number];
export type RecordSource = (typeof recordSources)[number];

export type TimeblockState = 'upcoming' | 'active' | 'past';
