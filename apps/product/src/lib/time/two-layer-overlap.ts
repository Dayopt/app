type RangeInput = Date | string | null | undefined;

export interface TwoLayerOverlapEntry {
  id: string;
  plannedStart?: RangeInput;
  plannedEnd?: RangeInput;
  actualStart?: RangeInput;
  actualEnd?: RangeInput;
}

export interface TwoLayerOverlapTarget {
  id?: string | null | undefined;
  plannedStart?: RangeInput;
  plannedEnd?: RangeInput;
  actualStart?: RangeInput;
  actualEnd?: RangeInput;
  /** 既存の予定だけ entry など、actual range が両方 null の target を許可する。 */
  allowMissingActual?: boolean | undefined;
  forbidFutureActual?: boolean | undefined;
  now?: number | undefined;
}

function toTime(value: RangeInput): number | null {
  if (value == null) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

export function rangesOverlap(
  firstStart: RangeInput,
  firstEnd: RangeInput,
  secondStart: RangeInput,
  secondEnd: RangeInput,
): boolean {
  const firstStartMs = toTime(firstStart);
  const firstEndMs = toTime(firstEnd);
  const secondStartMs = toTime(secondStart);
  const secondEndMs = toTime(secondEnd);

  if (firstStartMs == null || firstEndMs == null || secondStartMs == null || secondEndMs == null) {
    return false;
  }

  return firstStartMs < secondEndMs && firstEndMs > secondStartMs;
}

function hasInvalidTargetRange(start: RangeInput, end: RangeInput): boolean {
  const hasStart = start != null;
  const hasEnd = end != null;
  if (hasStart !== hasEnd) return true;
  if (!hasStart || !hasEnd) return false;

  const startMs = toTime(start);
  const endMs = toTime(end);
  return startMs == null || endMs == null || endMs <= startMs;
}

function hasInvalidRequiredTargetRange(start: RangeInput, end: RangeInput): boolean {
  if (start == null || end == null) return true;
  return hasInvalidTargetRange(start, end);
}

export function hasTwoLayerTimeConflict(
  entries: TwoLayerOverlapEntry[],
  target: TwoLayerOverlapTarget,
): boolean {
  const actualRangeMissing = target.actualStart == null && target.actualEnd == null;
  if (
    hasInvalidTargetRange(target.plannedStart, target.plannedEnd) ||
    (target.allowMissingActual && actualRangeMissing
      ? target.plannedStart == null || target.plannedEnd == null
      : hasInvalidRequiredTargetRange(target.actualStart, target.actualEnd))
  ) {
    return true;
  }

  const actualEndMs = toTime(target.actualEnd);
  if (
    target.forbidFutureActual &&
    actualEndMs != null &&
    actualEndMs > (target.now ?? Date.now())
  ) {
    return true;
  }

  return entries.some((entry) => {
    if (target.id != null && entry.id === target.id) return false;

    if (
      rangesOverlap(target.plannedStart, target.plannedEnd, entry.plannedStart, entry.plannedEnd)
    ) {
      return true;
    }

    return rangesOverlap(target.actualStart, target.actualEnd, entry.actualStart, entry.actualEnd);
  });
}
