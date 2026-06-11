import type { EntryPosition } from '../../shared/hooks/useViewEntries';

export function toWeekDayEntryPosition(pos: EntryPosition): EntryPosition {
  const columnWidth = 100 / Math.max(pos.totalColumns, 1);

  return {
    ...pos,
    left: columnWidth * pos.column,
    width: columnWidth,
    opacity: 1.0,
  };
}
