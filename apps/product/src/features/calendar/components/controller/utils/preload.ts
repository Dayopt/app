/** カレンダービューコンポーネントをプリロードしてナビゲーションを高速化する */
export const preloadCalendarViews = () => {
  // 最もよく使うビューを先読み（絶対パスで指定）
  import('@/features/calendar/components/views/DayView');
  import('@/features/calendar/components/views/WeekView');
  import('@/features/calendar/components/views/MultiDayView');
};

/** クライアントサイドでのみビュープリロードを初期化する（requestIdleCallback / setTimeout フォールバック） */
export const initializePreload = () => {
  if (typeof window !== 'undefined') {
    if ('requestIdleCallback' in window) {
      (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(
        preloadCalendarViews,
      );
    } else {
      // Safari等のフォールバック
      setTimeout(preloadCalendarViews, 1000);
    }
  }
};
