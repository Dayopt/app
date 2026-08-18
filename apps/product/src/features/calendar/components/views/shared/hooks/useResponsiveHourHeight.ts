/**
 * レスポンシブなHOUR_HEIGHTを管理するフック
 *
 * Zustand store で hourHeight を一元管理し、全コンシューマが
 * 同一レンダーで同じ値を読むことを保証する。
 *
 * リサイズ検知は useHourHeightSync() に分離し、
 * ScrollableCalendarLayout で1箇所のみ呼び出す。
 */

import { useEffect } from 'react';

import { useCalendarSettings } from '@/features/calendar/hooks/useCalendarSettings';
import { create } from 'zustand';

import { DENSITY_FACTOR, HOUR_HEIGHT, MIN_LEGIBLE_HOUR_HEIGHT } from '../constants/grid.constants';

// ========================================
// Store
// ========================================

interface HourHeightState {
  hourHeight: number;
  setHourHeight: (height: number) => void;
}

const useHourHeightStore = create<HourHeightState>((set) => ({
  hourHeight: HOUR_HEIGHT,
  setHourHeight: (height) =>
    set((state) => (state.hourHeight === height ? state : { hourHeight: height })),
}));

// ========================================
// Public hooks
// ========================================

/** hourHeight を読む（store から） */
export function useResponsiveHourHeight(): number {
  return useHourHeightStore((s) => s.hourHeight);
}

/**
 * コンテナ実測高 → hourHeight を同期するフック
 *
 * カレンダー内で **1箇所のみ** 呼ぶ（ScrollableCalendarLayout）。
 * 密度設定の変更にも対応。
 *
 * hourHeight = max(MIN_LEGIBLE_HOUR_HEIGHT, floor((containerHeight / 24) * DENSITY_FACTOR[density]))
 * compact(factor=1.0) は 24h が正確に containerHeight へフィットする（スクロールなし）。
 * default/spacious はその上の倍率で、意図的にスクロールを許容する。
 * containerHeight が未計測（0）の間は SSR フォールバック（HOUR_HEIGHT）のままにする。
 */
export function useHourHeightSync(containerHeight: number): void {
  const density = useCalendarSettings((s) => s.hourHeightDensity);
  const setHourHeight = useHourHeightStore((s) => s.setHourHeight);

  useEffect(() => {
    if (containerHeight <= 0) return;

    const factor = DENSITY_FACTOR[density];
    const fitHeight = Math.floor((containerHeight / 24) * factor);
    setHourHeight(Math.max(MIN_LEGIBLE_HOUR_HEIGHT, fitHeight));
  }, [containerHeight, density, setHourHeight]);
}
