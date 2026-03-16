import type { CSSProperties } from 'react';
import { useMemo } from 'react';

import { computeEntryStyles } from '../../../../lib/grid';

import type { EntryPosition } from './useViewEntries';

/**
 * エントリ位置情報からCSSスタイルを計算するフック
 * engine/grid.ts の computeEntryStyles の React ラッパー
 */
export function useEntryStyles(entryPositions: EntryPosition[]): Record<string, CSSProperties> {
  return useMemo((): Record<string, CSSProperties> => {
    const inputs = entryPositions
      .filter((p) => p.plan?.id)
      .map(({ plan, top, height, left, width, zIndex, opacity }) => ({
        id: plan.id,
        top,
        height,
        left,
        width,
        zIndex,
        ...(opacity != null ? { opacity } : {}),
      }));

    return computeEntryStyles(inputs);
  }, [entryPositions]);
}
