/**
 * レスポンシブなHOUR_HEIGHTを管理するフック
 * Store の hourHeightDensity 設定とデバイスサイズに基づいて高さを返す
 */

import { useEffect, useState } from 'react';

import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import { HOUR_HEIGHT, HOUR_HEIGHT_DENSITIES } from '../constants/grid.constants';

export function useResponsiveHourHeight(): number {
  const density = useCalendarSettingsStore(
    (s) => s.sessionOverrides.hourHeightDensity ?? s.hourHeightDensity,
  );
  const config = HOUR_HEIGHT_DENSITIES[density];

  const [hourHeight, setHourHeight] = useState<number>(HOUR_HEIGHT);

  useEffect(() => {
    const updateHourHeight = () => {
      const width = window.innerWidth;

      if (width < 768) {
        setHourHeight(config.mobile);
      } else if (width < 1024) {
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

/**
 * ブレークポイント判定用のフック
 */
export function useBreakpoint() {
  const [breakpoint, setBreakpoint] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');

  useEffect(() => {
    const updateBreakpoint = () => {
      const width = window.innerWidth;

      if (width < 768) {
        setBreakpoint('mobile');
      } else if (width < 1024) {
        setBreakpoint('tablet');
      } else {
        setBreakpoint('desktop');
      }
    };

    updateBreakpoint();
    window.addEventListener('resize', updateBreakpoint);

    return () => {
      window.removeEventListener('resize', updateBreakpoint);
    };
  }, []);

  return breakpoint;
}
