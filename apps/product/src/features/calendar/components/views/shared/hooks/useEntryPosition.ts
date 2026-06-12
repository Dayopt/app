/**
 * エントリ配置計算フック
 */

import { useMemo } from 'react';

import type { EntryCardPosition } from '@/features/entry';
import { layoutEntryToVerticalPosition } from '../../../../lib/grid';
import type { TimedEntry } from '../../../../types/entry.types';
import { HOUR_HEIGHT } from '../constants/grid.constants';

import { useEntryLayoutCalculator } from './useEntryLayoutCalculator';

interface UseEntryPositionOptions {
  hourHeight?: number;
}

/** エントリのグリッド上の配置位置（top/height/left/width）をMapで返すフック */
export function useEntryPosition(entries: TimedEntry[], options: UseEntryPositionOptions = {}) {
  const { hourHeight = HOUR_HEIGHT } = options;

  // useEntryLayoutCalculator で列配置を計算
  const layouts = useEntryLayoutCalculator(entries);

  const entryPositions = useMemo(() => {
    const positions = new Map<string, EntryCardPosition>();

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

  return entryPositions;
}
