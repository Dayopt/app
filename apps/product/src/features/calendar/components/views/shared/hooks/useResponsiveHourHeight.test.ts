import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  density: 'default' as 'compact' | 'default' | 'spacious',
}));

vi.mock('@/features/calendar/hooks/useCalendarSettings', () => ({
  useCalendarSettings: (selector: (settings: object) => unknown) =>
    selector({ hourHeightDensity: mocks.density }),
}));

import { HOUR_HEIGHT, MIN_LEGIBLE_HOUR_HEIGHT } from '../constants/grid.constants';
import { useHourHeightSync, useResponsiveHourHeight } from './useResponsiveHourHeight';

describe('useHourHeightSync', () => {
  beforeEach(() => {
    mocks.density = 'default';
  });

  it('containerHeight が未計測（0）の間は SSR フォールバック値のままにする', () => {
    const { result } = renderHook(() => {
      useHourHeightSync(0);
      return useResponsiveHourHeight();
    });

    expect(result.current).toBe(HOUR_HEIGHT);
  });

  it('compact(factor=1.0) は 24h が containerHeight に正確にフィットする', () => {
    mocks.density = 'compact';
    const { result } = renderHook(() => {
      useHourHeightSync(1200);
      return useResponsiveHourHeight();
    });

    // floor(1200/24 * 1.0) = 50
    expect(result.current).toBe(50);
  });

  it('default(factor=1.5) は fit の1.5倍になり、24h分の合計がcontainerHeightを超える（意図的スクロール）', () => {
    mocks.density = 'default';
    const { result } = renderHook(() => {
      useHourHeightSync(1200);
      return useResponsiveHourHeight();
    });

    // floor(1200/24 * 1.5) = 75
    expect(result.current).toBe(75);
    expect(result.current * 24).toBeGreaterThan(1200);
  });

  it('spacious(factor=2.0) は fit の2倍になる', () => {
    mocks.density = 'spacious';
    const { result } = renderHook(() => {
      useHourHeightSync(1200);
      return useResponsiveHourHeight();
    });

    // floor(1200/24 * 2.0) = 100
    expect(result.current).toBe(100);
  });

  it('極端に低いコンテナでも MIN_LEGIBLE_HOUR_HEIGHT を下回らない', () => {
    mocks.density = 'compact';
    const { result } = renderHook(() => {
      useHourHeightSync(100); // floor(100/24) = 4, フロア未満
      return useResponsiveHourHeight();
    });

    expect(result.current).toBe(MIN_LEGIBLE_HOUR_HEIGHT);
  });

  it('containerHeight の変化に追従して再計算する', () => {
    mocks.density = 'compact';
    const { result, rerender } = renderHook(
      ({ height }: { height: number }) => {
        useHourHeightSync(height);
        return useResponsiveHourHeight();
      },
      { initialProps: { height: 1200 } },
    );

    expect(result.current).toBe(50);

    act(() => {
      rerender({ height: 2400 });
    });

    expect(result.current).toBe(100);
  });
});
