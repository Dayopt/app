/**
 * グリッド生成ロジックのフック
 */

import { useMemo } from 'react';

import { HOUR_HEIGHT } from '../constants/grid.constants';

/** 時間グリッドの1時間分のデータ */
export interface TimeGridHours {
  hour: number;
  label: string;
  position: number; // Y座標
}

export interface UseTimeGridOptions {
  startHour?: number;
  endHour?: number;
  hourHeight?: number;
  format?: '12h' | '24h';
}

/** 時間グリッドの時間一覧とグリッド高さを返すフック */
export function useTimeGrid(options: UseTimeGridOptions = {}) {
  const { startHour = 0, endHour = 24, hourHeight = HOUR_HEIGHT, format = '24h' } = options;

  const hours = useMemo(() => {
    const result: TimeGridHours[] = [];

    for (let hour = startHour; hour < endHour; hour++) {
      const label =
        format === '24h'
          ? `${String(hour).padStart(2, '0')}:00`
          : `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`;

      result.push({
        hour,
        label,
        position: (hour - startHour) * hourHeight,
      });
    }

    return result;
  }, [startHour, endHour, hourHeight, format]);

  const gridHeight = useMemo(() => {
    return (endHour - startHour) * hourHeight;
  }, [startHour, endHour, hourHeight]);

  return {
    hours,
    gridHeight,
    hourHeight,
    startHour,
    endHour,
  };
}
