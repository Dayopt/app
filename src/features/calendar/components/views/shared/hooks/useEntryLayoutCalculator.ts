import { useMemo } from 'react';

import { calculateEntryLayouts } from '../../../../lib/layout';
import type { TimedEntry } from '../../../../types/entry.types';

// Re-export EntryLayout type for consumers
export type { EntryLayout } from '../../../../lib/layout';

/**
 * エントリの重複レイアウト計算フック
 * Googleカレンダー風の横並び配置を実現
 *
 * 純粋ロジックは engine/layout.ts に委譲。
 * このフックは useMemo ラッパーのみ。
 */
export function useEntryLayoutCalculator(entries: TimedEntry[]) {
  return useMemo(() => calculateEntryLayouts(entries), [entries]);
}
