/**
 * レスポンシブなHOUR_HEIGHTを管理するフック
 * Store の hourHeightDensity 設定とデバイスサイズに基づいて高さを返す
 */

import { useEffect, useState } from 'react';

import { BREAKPOINT_VALUES } from '@/lib/breakpoints';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import { HOUR_HEIGHT, HOUR_HEIGHT_DENSITIES } from '../constants/grid.constants';

export function useResponsiveHourHeight(): number {
  const density = useCalendarSettingsStore((s) => s.hourHeightDensity);
  const config = HOUR_HEIGHT_DENSITIES[density];

  const [hourHeight, setHourHeight] = useState<number>(HOUR_HEIGHT);

  useEffect(() => {
    const updateHourHeight = () => {
      const width = window.innerWidth;

      if (width < BREAKPOINT_VALUES.md) {
        setHourHeight(config.mobile);
      } else if (width < BREAKPOINT_VALUES.lg) {
        setHourHeight(config.tablet);
      } else {
        setHourHeight(config.desktop);
      }
    };

    updateHourHeight();

    // デバウンス: リサイズ中のカスケードsetState → レイアウトスラッシングを抑制
    let timerId: ReturnType<typeof setTimeout>;
    const debouncedUpdate = () => {
      clearTimeout(timerId);
      timerId = setTimeout(updateHourHeight, 100);
    };

    window.addEventListener('resize', debouncedUpdate);
    return () => {
      window.removeEventListener('resize', debouncedUpdate);
      clearTimeout(timerId);
    };
  }, [config.mobile, config.tablet, config.desktop]);

  return hourHeight;
}
