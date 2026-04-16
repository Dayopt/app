'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const SCROLL_THRESHOLD = 10;
const TOP_THRESHOLD = 4;

interface UseHideOnScrollReturn {
  hidden: boolean;
  reset: () => void;
}

/**
 * スクロール方向に応じて hidden 状態を返すフック。
 * 下スクロールで hidden=true、上スクロールで hidden=false。
 *
 * capture phase で document 上の全 scroll イベントを捕捉するため、
 * window スクロールでも overflow-y-auto コンテナでも動作する。
 */
export function useHideOnScroll(): UseHideOnScrollReturn {
  const [hidden, setHidden] = useState(false);
  const accumulatedDeltaRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const scrollTopCacheRef = useRef(new WeakMap<object, number>());

  const reset = useCallback(() => {
    setHidden(false);
    accumulatedDeltaRef.current = 0;
  }, []);

  useEffect(() => {
    const scrollTopCache = scrollTopCacheRef.current;

    function handleScroll(event: Event) {
      const target = event.target;

      const isWindowScroll = target === document || target === window;
      const currentScrollTop = isWindowScroll
        ? window.scrollY
        : target instanceof Element
          ? target.scrollTop
          : -1;

      if (currentScrollTop < 0) return;

      const cacheKey: object = isWindowScroll ? document : (target as Element);
      const lastScrollTop = scrollTopCache.get(cacheKey) ?? 0;
      const delta = currentScrollTop - lastScrollTop;
      const absDelta = Math.abs(delta);

      if (absDelta < 1) return;

      scrollTopCache.set(cacheKey, currentScrollTop);

      // 方向転換で accumulator リセット
      if (
        (delta > 0 && accumulatedDeltaRef.current < 0) ||
        (delta < 0 && accumulatedDeltaRef.current > 0)
      ) {
        accumulatedDeltaRef.current = delta;
      } else {
        accumulatedDeltaRef.current += delta;
      }

      if (Math.abs(accumulatedDeltaRef.current) < SCROLL_THRESHOLD) return;

      const shouldHide = currentScrollTop > TOP_THRESHOLD && delta > 0;

      if (rafIdRef.current !== null) return;

      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        setHidden(shouldHide);
      });
    }

    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });

    return () => {
      document.removeEventListener('scroll', handleScroll, { capture: true });
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return { hidden, reset };
}
