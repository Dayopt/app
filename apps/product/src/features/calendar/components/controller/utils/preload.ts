/** カレンダービューコンポーネントをプリロードしてナビゲーションを高速化する */
const preloadCalendarViews = () => {
  // 最もよく使うビューを先読み（絶対パスで指定）。
  // preload は best-effort であり、失敗は無視する。requestIdleCallback / setTimeout 経由で
  // 遅延実行されるため、vitest ではテスト環境 teardown 後に import が解決されて
  // unhandled rejection（EnvironmentTeardownError）になる flaky の原因だった
  import('@/features/calendar/components/views/DayView').catch(() => {});
  import('@/features/calendar/components/views/WeekView').catch(() => {});
  import('@/features/calendar/components/views/MultiDayView').catch(() => {});
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
