'use client';

import { useMediaQuery } from './useMediaQuery';

/**
 * モバイルデバイス判定フック
 *
 * タッチデバイスかつ画面幅 768px 未満をモバイルとみなす。
 * （breakpoints は app レベル概念のため、ここではクエリを inline して package を自己完結にする）
 */
export function useIsMobile(): boolean {
  const isSmallScreen = useMediaQuery('(max-width: 767px)');
  const isTouchDevice = useMediaQuery('(pointer: coarse)');
  return isSmallScreen && isTouchDevice;
}
