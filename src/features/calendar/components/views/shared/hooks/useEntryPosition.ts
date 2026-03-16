/**
 * エントリ配置計算フック
 */

import { useMemo } from 'react';

import type { EntryCardPosition } from '@/features/entry';
import { HOUR_HEIGHT } from '../constants/grid.constants';
import type { TimedEntry } from '../types/entry.types';

import { useEntryLayoutCalculator } from './useEntryLayoutCalculator';

export interface UseEntryPositionOptions {
  hourHeight?: number;
}

export interface PositionedEntry extends TimedEntry {
  position: EntryCardPosition;
}

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
      const startMinutes = entry.start.getHours() * 60 + entry.start.getMinutes();
      const endMinutes = entry.end.getHours() * 60 + entry.end.getMinutes();
      const top = (startMinutes * hourHeight) / 60;
      const height = Math.max(((endMinutes - startMinutes) * hourHeight) / 60, 20);

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
