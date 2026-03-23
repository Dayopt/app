import { useCallback, useEffect, useRef } from 'react';

/**
 * ドラッグ中にカレンダースクロールコンテナを自動スクロールするフック
 *
 * ポインタがコンテナの上端/下端に近づくと自動スクロールを開始。
 * スピードは端からの距離に比例（線形補間）。
 */

interface UseAutoScrollOnDragOptions {
  /** ドラッグ中か */
  isActive: boolean;
  /** 自動スクロール開始の端からの距離（px） */
  edgeThreshold?: number;
  /** 最大スクロール速度（px/frame） */
  maxSpeed?: number;
}

export function useAutoScrollOnDrag({
  isActive,
  edgeThreshold = 60,
  maxSpeed = 15,
}: UseAutoScrollOnDragOptions) {
  const rafIdRef = useRef<number | null>(null);
  const pointerYRef = useRef<number>(0);

  const updatePointerY = useCallback((y: number) => {
    pointerYRef.current = y;
  }, []);

  useEffect(() => {
    if (!isActive) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }

    const scrollContainer = document.querySelector<HTMLElement>('[data-calendar-scroll]');
    if (!scrollContainer) return;

    const tick = () => {
      const rect = scrollContainer.getBoundingClientRect();
      const y = pointerYRef.current;

      // 上端に近い → 上スクロール
      const distFromTop = y - rect.top;
      if (distFromTop >= 0 && distFromTop < edgeThreshold) {
        const ratio = 1 - distFromTop / edgeThreshold;
        scrollContainer.scrollTop -= maxSpeed * ratio;
      }

      // 下端に近い → 下スクロール
      const distFromBottom = rect.bottom - y;
      if (distFromBottom >= 0 && distFromBottom < edgeThreshold) {
        const ratio = 1 - distFromBottom / edgeThreshold;
        scrollContainer.scrollTop += maxSpeed * ratio;
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isActive, edgeThreshold, maxSpeed]);

  return { updatePointerY };
}
