'use client';

import { MEDIA_QUERIES } from '@/lib/breakpoints';

import { useMediaQuery } from './useMediaQuery';

/**
 * モバイルデバイス判定フック
 *
 * タッチデバイスかつ画面幅768px未満をモバイルとみなす
 * - タブレット横向き: PC扱い
 * - タブレット縦向き: モバイル扱い
 */
export function useIsMobile(): boolean {
  // 画面幅768px未満をモバイルとみなす（MEDIA_QUERIES.mobile = max-width: 767px）
  const isSmallScreen = useMediaQuery(MEDIA_QUERIES.mobile);

  // タッチデバイス判定（pointer: coarse = タッチスクリーン）
  const isTouchDevice = useMediaQuery('(pointer: coarse)');

  // 両方満たす場合のみモバイル
  return isSmallScreen && isTouchDevice;
}
