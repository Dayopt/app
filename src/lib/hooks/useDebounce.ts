import { useCallback, useEffect, useRef } from 'react';

/**
 * コールバック関数をデバウンス（遅延実行）するフック
 * @param callback デバウンス対象の関数
 * @param delay 遅延時間（ミリ秒）
 * @returns [デバウンスされた関数, キャンセル関数]
 */
export function useDebouncedCallback<T extends (...args: Parameters<T>) => ReturnType<T>>(
  callback: T,
  delay: number,
): [debounced: (...args: Parameters<T>) => void, cancel: () => void] {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  const delayRef = useRef(delay);

  // Keep refs up to date
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    delayRef.current = delay;
  }, [delay]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const debounced = useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delayRef.current);
  }, []);

  return [debounced, cancel];
}
