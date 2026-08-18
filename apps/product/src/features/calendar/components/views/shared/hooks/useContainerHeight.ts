/**
 * コンテナ要素の実測高さ（clientHeight）を ResizeObserver で追跡するフック
 *
 * viewport フィット計算（useHourHeightSync）の入力として使う。
 */

import { useEffect, useState, type RefObject } from 'react';

/** コンテナ要素の実測高さ（px）を返す。未マウント時は 0 */
export function useContainerHeight(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => setHeight(el.clientHeight);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return height;
}
