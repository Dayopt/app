export type TimeRange = Readonly<{
  start: Date;
  end: Date;
}>;

function cloneDate(value: Date): Date {
  return new Date(value.getTime());
}

export function createTimeRange(start: Date, end: Date): TimeRange {
  return {
    start: cloneDate(start),
    end: cloneDate(end),
  };
}

export function getTimeRangeDurationMs(range: TimeRange): number {
  return range.end.getTime() - range.start.getTime();
}

export function isValidTimeRange(range: TimeRange): boolean {
  return (
    Number.isFinite(range.start.getTime()) &&
    Number.isFinite(range.end.getTime()) &&
    getTimeRangeDurationMs(range) > 0
  );
}
