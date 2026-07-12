/**
 * エントリ配置計算フック
 */

import { useMemo } from 'react';

import type { TimeblockCardPosition } from '@/features/timeblock';
import { layoutEntryToVerticalPosition } from '../../../../lib/grid';
import type { TimedTimeblock } from '../../../../types/timeblock.types';
import { HOUR_HEIGHT } from '../constants/grid.constants';

import { useTimeblockLayoutCalculator } from './useTimeblockLayoutCalculator';

interface UseEntryPositionOptions {
  hourHeight?: number;
}

/** エントリのグリッド上の配置位置（top/height/left/width）をMapで返すフック */
export function useTimeblockPosition(
  entries: TimedTimeblock[],
  options: UseEntryPositionOptions = {},
) {
  const { hourHeight = HOUR_HEIGHT } = options;

  // useTimeblockLayoutCalculator で列配置を計算
  const layouts = useTimeblockLayoutCalculator(entries);

  const timeblockPositions = useMemo(() => {
    const positions = new Map<string, TimeblockCardPosition>();

    if (layouts.length === 0) return positions;

    // 各エントリの位置を計算
    layouts.forEach((layout) => {
      const { entry, width, left } = layout;

      // 時刻からピクセル位置を計算
      const { top, height } = layoutEntryToVerticalPosition(entry.start, entry.end, hourHeight);

      positions.set(entry.id, {
        top,
        left,
        width,
        height,
        zIndex: 10,
      });
    });

    return positions;
  }, [layouts, hourHeight]);

  return timeblockPositions;
}
