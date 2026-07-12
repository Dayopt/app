import type { TimeblockPosition } from '../../shared/hooks/useViewTimeblocks';

export function toWeekDayTimeblockPosition(pos: TimeblockPosition): TimeblockPosition {
  const columnWidth = 100 / Math.max(pos.totalColumns, 1);

  return {
    ...pos,
    left: columnWidth * pos.column,
    width: columnWidth,
    opacity: 1.0,
  };
}
