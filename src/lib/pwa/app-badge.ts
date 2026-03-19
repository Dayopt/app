/**
 * App Badging API ラッパー
 *
 * PWAアイコンにバッジ（未読数）を表示する。
 * 対応ブラウザ: Chrome 81+, Edge 81+（iOS Safari非対応）
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Badging_API
 */

import { logger } from '@/lib/logger';

/** App Badging API がサポートされているか */
export function isAppBadgeSupported(): boolean {
  return typeof navigator !== 'undefined' && 'setAppBadge' in navigator;
}

/**
 * アプリバッジに未読数を表示
 *
 * @param count - 表示する数値（0の場合はバッジをクリア）
 */
export async function setAppBadge(count: number): Promise<void> {
  if (!isAppBadgeSupported()) return;

  try {
    if (count > 0) {
      await navigator.setAppBadge(count);
    } else {
      await navigator.clearAppBadge();
    }
  } catch (error) {
    // NotAllowedError: ユーザーがPWAとしてインストールしていない場合
    logger.warn('[AppBadge] Failed to set badge:', error);
  }
}

/**
 * アプリバッジをクリア
 */
export async function clearAppBadge(): Promise<void> {
  if (!isAppBadgeSupported()) return;

  try {
    await navigator.clearAppBadge();
  } catch (error) {
    logger.warn('[AppBadge] Failed to clear badge:', error);
  }
}

// navigator の型拡張
declare global {
  interface Navigator {
    setAppBadge(count?: number): Promise<void>;
    clearAppBadge(): Promise<void>;
  }
}
