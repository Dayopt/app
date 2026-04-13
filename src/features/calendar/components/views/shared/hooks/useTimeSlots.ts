import { useMemo } from 'react';

import { generateTimeSlots } from '../../../../lib/grid';
import type { TimeSlot } from '../../../../types/grid.types';

/** useTimeSlots フックのオプション */
interface UseTimeSlotsOptions {
  startHour?: number;
  endHour?: number;
  interval?: number;
}

/**
 * 時間スロット生成フック
 * engine/grid.ts の generateTimeSlots の React ラッパー
 */
export function useTimeSlots({
  startHour = 0,
  endHour = 24,
  interval = 15,
}: UseTimeSlotsOptions = {}): TimeSlot[] {
  return useMemo(
    () => generateTimeSlots(startHour, endHour, interval),
    [startHour, endHour, interval],
  );
}
