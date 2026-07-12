import { useMemo } from 'react';

import { calculateTimeblockLayouts } from '../../../../lib/layout';
import type { TimedTimeblock } from '../../../../types/timeblock.types';

// Re-export TimeblockLayout type for consumers
export type { TimeblockLayout } from '../../../../lib/layout';

/**
 * エントリの重複レイアウト計算フック
 * Googleカレンダー風の横並び配置を実現
 *
 * 純粋ロジックは engine/layout.ts に委譲。
 * このフックは useMemo ラッパーのみ。
 */
export function useTimeblockLayoutCalculator(entries: TimedTimeblock[]) {
  return useMemo(() => calculateTimeblockLayouts(entries), [entries]);
}
