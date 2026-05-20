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

import { useCalendarSettingsStore } from '@/features/calendar/stores/useCalendarSettingsStore';
import { BREAKPOINT_VALUES } from '@/lib/breakpoints';
import { create } from 'zustand';

import { HOUR_HEIGHT, HOUR_HEIGHT_DENSITIES } from '../constants/grid.constants';

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
 * ウィンドウサイズ → hourHeight を同期するフック
 *
 * カレンダー内で **1箇所のみ** 呼ぶ（ScrollableCalendarLayout）。
 * 密度設定の変更にも対応。
 */
export function useHourHeightSync(): void {
  const density = useCalendarSettingsStore((s) => s.hourHeightDensity);
  const config = HOUR_HEIGHT_DENSITIES[density];
  const setHourHeight = useHourHeightStore((s) => s.setHourHeight);

  useEffect(() => {
    const update = () => {
      const width = window.innerWidth;

      if (width < BREAKPOINT_VALUES.md) {
        setHourHeight(config.mobile);
      } else if (width < BREAKPOINT_VALUES.lg) {
        setHourHeight(config.tablet);
      } else {
        setHourHeight(config.desktop);
      }
    };

    update();

    // デバウンス: リサイズ中のカスケード更新 → レイアウトスラッシングを抑制
    let timerId: ReturnType<typeof setTimeout>;
    const debouncedUpdate = () => {
      clearTimeout(timerId);
      timerId = setTimeout(update, 100);
    };

    window.addEventListener('resize', debouncedUpdate);
    return () => {
      window.removeEventListener('resize', debouncedUpdate);
      clearTimeout(timerId);
    };
  }, [config.mobile, config.tablet, config.desktop, setHourHeight]);
}
