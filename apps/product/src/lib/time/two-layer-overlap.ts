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

export function hasTwoLayerTimeConflict(
  entries: TwoLayerOverlapEntry[],
  target: TwoLayerOverlapTarget,
): boolean {
  // 自動記録モデル: 未来の planned は actual レイヤーを占有しない（actual NULL = 未編集）。
  // target は少なくともどちらか一方のレイヤーを占有していなければならない。
  if (
    hasInvalidTargetRange(target.plannedStart, target.plannedEnd) ||
    hasInvalidTargetRange(target.actualStart, target.actualEnd)
  ) {
    return true;
  }
  if (target.plannedStart == null && target.actualStart == null) {
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
