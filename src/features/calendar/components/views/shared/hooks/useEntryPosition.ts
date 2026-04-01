/**
 * エントリ配置計算フック
 */

import { useMemo } from 'react';

import type { EntryCardPosition } from '@/features/entry';
import { layoutEntryToVerticalPosition } from '../../../../lib/grid';
import { HOUR_HEIGHT } from '../constants/grid.constants';
import type { TimedEntry } from '../types/entry.types';

import { useEntryLayoutCalculator } from './useEntryLayoutCalculator';

export interface UseEntryPositionOptions {
  hourHeight?: number;
}

/** 位置情報が付加されたエントリ型 */
export interface PositionedEntry extends TimedEntry {
  position: EntryCardPosition;
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

/**
 * エントリと位置を結合して配置済みエントリを返すフック
 */
/** エントリに位置情報を結合して配置済みエントリ配列を返すフック */
export function usePositionedEntries(
  entries: TimedEntry[],
  options: UseEntryPositionOptions = {},
): PositionedEntry[] {
  const positions = useEntryPosition(entries, options);

  return useMemo(() => {
    return entries.map((entry) => ({
      ...entry,
      position: positions.get(entry.id) || {
        top: 0,
        left: 0,
        width: 100,
        height: 20,
        zIndex: 10,
      },
    }));
  }, [entries, positions]);
}
