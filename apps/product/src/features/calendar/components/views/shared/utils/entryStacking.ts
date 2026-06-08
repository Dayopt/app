import type { CalendarEvent } from '../../../../types/calendar.types';

const UNPLANNED_STACK_OFFSET = 100;

/** 同じ時間帯で重なる予定より、予定外記録を前面に出すための z-index を返す。 */
export function getEntryStackIndex(
  entry: Pick<CalendarEvent, 'origin'>,
  orderIndex: number,
  base = 10,
): number {
  return base + orderIndex + (entry.origin === 'unplanned' ? UNPLANNED_STACK_OFFSET : 0);
}
