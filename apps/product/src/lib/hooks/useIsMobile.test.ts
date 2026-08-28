import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MEDIA_QUERIES } from '@/lib/breakpoints';

// useMediaQueryの結果をモックする
const mockUseMediaQuery = vi.fn();
vi.mock('./useMediaQuery', () => ({
  useMediaQuery: (query: string) => mockUseMediaQuery(query),
}));

import { useIsMobile } from './useIsMobile';

describe('useIsMobile', () => {
  it('小画面 + タッチデバイスの場合はモバイル', () => {
    mockUseMediaQuery.mockImplementation((query: string) => {
      if (query === MEDIA_QUERIES.mobile) return true;
      if (query === '(pointer: coarse)') return true;
      return false;
    });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('大画面 + タッチデバイスの場合はPC（タブレット横向き）', () => {
    mockUseMediaQuery.mockImplementation((query: string) => {
      if (query === MEDIA_QUERIES.mobile) return false;
      if (query === '(pointer: coarse)') return true;
      return false;
    });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('小画面 + マウスデバイスの場合はPC（デスクトップ小画面）', () => {
    mockUseMediaQuery.mockImplementation((query: string) => {
      if (query === MEDIA_QUERIES.mobile) return true;
      if (query === '(pointer: coarse)') return false;
      return false;
    });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('大画面 + マウスデバイスの場合はPC', () => {
    mockUseMediaQuery.mockImplementation((query: string) => {
      if (query === MEDIA_QUERIES.mobile) return false;
      if (query === '(pointer: coarse)') return false;
      return false;
    });

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});
