/**
 * スクロール可能カレンダーのスクロール管理・キーボードナビゲーション
 *
 * ScrollableCalendarLayoutから抽出したカスタムフック
 */

import { useCallback, useEffect, useRef, type RefObject } from 'react';

import { getScrollPosition, setScrollPosition } from '../../../../stores/calendarScrollStore';

/** スクロール管理に使用するカレンダービューモード */
type CalendarViewModeForScroll = 'day' | '3day' | '5day' | 'week';

interface UseScrollableCalendarOptions {
  viewMode: CalendarViewModeForScroll;
  hourHeight: number;
  enableKeyboardNavigation?: boolean | undefined;
  onScrollPositionChange?: ((scrollTop: number) => void) | undefined;
}

interface UseScrollableCalendarReturn {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  handleKeyDown: (e: React.KeyboardEvent | KeyboardEvent) => void;
}

/**
 * スクロール可能カレンダーのスクロール管理・キーボードナビゲーション
 */
export const useScrollableCalendar = ({
  viewMode,
  hourHeight,
  enableKeyboardNavigation = true,
  onScrollPositionChange,
}: UseScrollableCalendarOptions): UseScrollableCalendarReturn => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const hasRestoredScroll = useRef(false);

  // 密度変更時のスクロール位置保持
  const prevHourHeight = useRef(hourHeight);
  useEffect(() => {
    if (prevHourHeight.current !== hourHeight && scrollContainerRef.current) {
      const timeAtTop = scrollContainerRef.current.scrollTop / prevHourHeight.current;
      scrollContainerRef.current.scrollTo({
        top: timeAtTop * hourHeight,
        behavior: 'instant',
      });
    }
    prevHourHeight.current = hourHeight;
  }, [hourHeight]);

  // 初期スクロール位置の設定（保存された位置を優先、なければ現在時刻を中央に）
  // viewMode変更時のhasRestoredScrollリセットも統合（effect順序のrace回避）
  const prevViewMode = useRef(viewMode);
  useEffect(() => {
    // viewMode変更時にフラグをリセット
    if (prevViewMode.current !== viewMode) {
      prevViewMode.current = viewMode;
      hasRestoredScroll.current = false;
    }

    if (!scrollContainerRef.current || hasRestoredScroll.current) return;

    const savedPosition = getScrollPosition(viewMode);

    let targetScroll: number;
    if (savedPosition > 0) {
      // 保存された位置がある場合は復元
      targetScroll = savedPosition;
    } else {
      // 保存がない場合は現在時刻を画面中央に
      const now = new Date();
      const currentHour = now.getHours() + now.getMinutes() / 60;
      const currentPosition = currentHour * hourHeight;
      const containerHeight = scrollContainerRef.current.clientHeight;
      // 現在時刻が画面中央に来るように調整
      targetScroll = Math.max(0, currentPosition - containerHeight / 2);
    }

    hasRestoredScroll.current = true;
    const useSmoothScroll = savedPosition <= 0;

    requestAnimationFrame(() => {
      scrollContainerRef.current?.scrollTo({
        top: targetScroll,
        behavior: useSmoothScroll ? 'smooth' : 'instant',
      });
    });
  }, [viewMode, hourHeight]);

  // スクロールイベントの処理
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return;

    const { scrollTop } = scrollContainerRef.current;

    if (onScrollPositionChange) {
      onScrollPositionChange(scrollTop);
    }

    // スクロール位置をモジュールストアに保存
    setScrollPosition(viewMode, scrollTop);
  }, [onScrollPositionChange, viewMode]);

  // スクロールリスナーの設定
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // キーボードナビゲーション
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent | KeyboardEvent) => {
      if (!enableKeyboardNavigation || !scrollContainerRef.current) {
        return;
      }

      // Calendar内のcardやReact Portalからbubbleしたキー操作は各UIに委ねる。
      if (e.target !== e.currentTarget) return;

      const container = scrollContainerRef.current;
      const currentScroll = container.scrollTop;

      switch (e.key) {
        case 'PageUp':
          e.preventDefault();
          container.scrollTop = Math.max(0, currentScroll - container.clientHeight);
          break;
        case 'PageDown':
          e.preventDefault();
          container.scrollTop = currentScroll + container.clientHeight;
          break;
        case 'Home':
          if (e.ctrlKey) {
            e.preventDefault();
            container.scrollTop = 0;
          }
          break;
        case 'End':
          if (e.ctrlKey) {
            e.preventDefault();
            container.scrollTop = container.scrollHeight;
          }
          break;
        case 'ArrowUp':
          if (e.ctrlKey) {
            e.preventDefault();
            container.scrollTop = Math.max(0, currentScroll - hourHeight);
          }
          break;
        case 'ArrowDown':
          if (e.ctrlKey) {
            e.preventDefault();
            container.scrollTop = currentScroll + hourHeight;
          }
          break;
      }
    },
    [enableKeyboardNavigation, hourHeight],
  );

  return {
    scrollContainerRef,
    handleKeyDown,
  };
};
