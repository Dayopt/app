'use client';

import { useSyncExternalStore } from 'react';

/**
 * prefers-reduced-motion メディアクエリを監視するフック
 *
 * useSyncExternalStore を使い、SSR安全かつ
 * useEffect + setState パターンを回避する。
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
 * @see https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html
 *
 * @example
 * ```tsx
 * const prefersReducedMotion = useReducedMotion()
 *
 * return (
 *   <div className={prefersReducedMotion ? '' : 'animate-fade-in'}>
 *     Content
 *   </div>
 * )
 * ```
 */

const MEDIA_QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(callback: () => void) {
  const mediaQuery = window.matchMedia(MEDIA_QUERY);
  mediaQuery.addEventListener('change', callback);
  return () => {
    mediaQuery.removeEventListener('change', callback);
  };
}

function getSnapshot() {
  return window.matchMedia(MEDIA_QUERY).matches;
}

function getServerSnapshot() {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
