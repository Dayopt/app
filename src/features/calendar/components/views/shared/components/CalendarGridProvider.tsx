/**
 * カレンダーグリッドのCSS変数を管理するプロバイダー
 */

'use client';

import React, { useEffect } from 'react';

import { useResponsiveHourHeight } from '../hooks/useResponsiveHourHeight';

interface CalendarGridProviderProps {
  children: React.ReactNode;
}

/** カレンダーグリッドのCSS変数（--calendar-hour-height等）をルート要素に設定するプロバイダー */
export const CalendarGridProvider = ({ children }: CalendarGridProviderProps) => {
  const hourHeight = useResponsiveHourHeight();

  useEffect(() => {
    // CSS変数をルート要素に設定
    const root = document.documentElement;

    root.style.setProperty('--calendar-hour-height', `${hourHeight}px`);
    root.style.setProperty('--calendar-half-hour-height', `${hourHeight / 2}px`);
    root.style.setProperty('--calendar-quarter-hour-height', `${hourHeight / 4}px`);
    root.style.setProperty('--calendar-minute-height', `${hourHeight / 60}px`);
    root.style.setProperty('--calendar-grid-height', `${hourHeight * 24}px`);

    return () => {
      // クリーンアップ
      root.style.removeProperty('--calendar-hour-height');
      root.style.removeProperty('--calendar-half-hour-height');
      root.style.removeProperty('--calendar-quarter-hour-height');
      root.style.removeProperty('--calendar-minute-height');
      root.style.removeProperty('--calendar-grid-height');
    };
  }, [hourHeight]);

  return <>{children}</>;
};

/**
 * CSS変数を使用するためのユーティリティフック
 */
export function useCalendarGridVars() {
  const hourHeight = useResponsiveHourHeight();

  return {
    hourHeight,
    halfHourHeight: hourHeight / 2,
    quarterHourHeight: hourHeight / 4,
    minuteHeight: hourHeight / 60,
    gridHeight: hourHeight * 24,
    // CSS変数名
    cssVars: {
      hourHeight: 'var(--calendar-hour-height, 72px)',
      halfHourHeight: 'var(--calendar-half-hour-height, 36px)',
      quarterHourHeight: 'var(--calendar-quarter-hour-height, 18px)',
      minuteHeight: 'var(--calendar-minute-height, 1.2px)',
      gridHeight: 'var(--calendar-grid-height, 1728px)',
    },
  };
}
