'use client';

import { useCallback, useEffect, useState } from 'react';

import { BREAKPOINT_VALUES } from '@/lib/breakpoints';

/** カレンダーのレイアウトモード */
export type LayoutMode = 'default' | 'compact' | 'fullscreen';
/** サイドバーの表示幅状態 */
export type SidebarWidth = 'full' | 'collapsed' | 'hidden';
/** レスポンシブブレークポイント */
export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

interface CalendarSidebarLayoutState {
  sidebarOpen: boolean;
  sidebarWidth: SidebarWidth;
  layoutMode: LayoutMode;
  currentBreakpoint: Breakpoint;
  showHeader: boolean;
  showSidebar: boolean;
}

/**
 * カレンダーサイドバー・レイアウト状態管理フック
 * サイドバーの開閉、レスポンシブ対応、レイアウトモード管理を担当。
 * 日付・ビューナビゲーションは CalendarNavigationContext が担う。
 */
export function useCalendarSidebarLayout(options?: {
  sidebarDefaultOpen?: boolean;
  showHeaderDefault?: boolean;
  showSidebarDefault?: boolean;
  persistSidebarState?: boolean;
  sidebarStorageKey?: string;
}) {
  const {
    sidebarDefaultOpen = true,
    showHeaderDefault = true,
    showSidebarDefault = true,
    persistSidebarState = true,
    sidebarStorageKey = 'calendar-sidebar-collapsed',
  } = options || {};

  // レスポンシブ対応のブレークポイント判定
  const [currentBreakpoint, setCurrentBreakpoint] = useState<Breakpoint>('desktop');

  // サイドバー状態の永続化対応
  const [state, setState] = useState<CalendarSidebarLayoutState>(() => {
    const sidebarOpen =
      persistSidebarState && typeof window !== 'undefined'
        ? (() => {
            const stored = localStorage.getItem(sidebarStorageKey);
            return stored ? JSON.parse(stored) : sidebarDefaultOpen;
          })()
        : sidebarDefaultOpen;

    return {
      sidebarOpen,
      sidebarWidth: 'full',
      layoutMode: 'default',
      currentBreakpoint: 'desktop',
      showHeader: showHeaderDefault,
      showSidebar: showSidebarDefault,
    };
  });

  // サイドバー状態の永続化
  useEffect(() => {
    if (persistSidebarState && typeof window !== 'undefined') {
      localStorage.setItem(sidebarStorageKey, JSON.stringify(state.sidebarOpen));
    }
  }, [state.sidebarOpen, persistSidebarState, sidebarStorageKey]);

  // ブレークポイント判定
  const checkBreakpoint = useCallback((): Breakpoint => {
    if (typeof window === 'undefined') return 'desktop';

    const width = window.innerWidth;
    if (width < BREAKPOINT_VALUES.md) return 'mobile';
    if (width < BREAKPOINT_VALUES.lg) return 'tablet';
    return 'desktop';
  }, []);

  // サイドバー幅の計算
  const getSidebarWidth = useCallback(
    (open: boolean, breakpoint: Breakpoint, showSidebar: boolean): SidebarWidth => {
      if (!showSidebar) return 'hidden';

      switch (breakpoint) {
        case 'mobile':
          // モバイルでは常にドロワー形式（hidden扱い）
          return 'hidden';
        case 'tablet':
          // タブレットでは折りたたみ表示
          return open ? 'full' : 'collapsed';
        case 'desktop':
          // デスクトップでは通常表示
          return open ? 'full' : 'collapsed';
        default:
          return 'full';
      }
    },
    [],
  );

  // ウィンドウリサイズ対応
  useEffect(() => {
    const handleResize = () => {
      const breakpoint = checkBreakpoint();
      const newSidebarWidth = getSidebarWidth(state.sidebarOpen, breakpoint, state.showSidebar);

      setState((prev) => ({
        ...prev,
        currentBreakpoint: breakpoint,
        sidebarWidth: newSidebarWidth,
      }));

      setCurrentBreakpoint(breakpoint);
    };

    // 初回実行
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [state.sidebarOpen, state.showSidebar, checkBreakpoint, getSidebarWidth]);

  // サイドバー開閉
  const toggleSidebar = useCallback(() => {
    setState((prev) => {
      const newOpen = !prev.sidebarOpen;
      const newSidebarWidth = getSidebarWidth(newOpen, prev.currentBreakpoint, prev.showSidebar);

      return {
        ...prev,
        sidebarOpen: newOpen,
        sidebarWidth: newSidebarWidth,
      };
    });
  }, [getSidebarWidth]);

  const setSidebarOpen = useCallback(
    (open: boolean) => {
      setState((prev) => {
        const newSidebarWidth = getSidebarWidth(open, prev.currentBreakpoint, prev.showSidebar);

        return {
          ...prev,
          sidebarOpen: open,
          sidebarWidth: newSidebarWidth,
        };
      });
    },
    [getSidebarWidth],
  );

  // レイアウトモード変更
  const setLayoutMode = useCallback(
    (mode: LayoutMode) => {
      setState((prev) => ({
        ...prev,
        layoutMode: mode,
        showHeader: mode === 'fullscreen' ? false : showHeaderDefault,
        showSidebar: mode === 'fullscreen' ? false : showSidebarDefault,
      }));
    },
    [showHeaderDefault, showSidebarDefault],
  );

  // ヘッダー表示/非表示
  const setShowHeader = useCallback((show: boolean) => {
    setState((prev) => ({ ...prev, showHeader: show }));
  }, []);

  // サイドバー表示/非表示
  const setShowSidebar = useCallback(
    (show: boolean) => {
      setState((prev) => {
        const newSidebarWidth = show
          ? getSidebarWidth(prev.sidebarOpen, prev.currentBreakpoint, true)
          : 'hidden';

        return {
          ...prev,
          showSidebar: show,
          sidebarWidth: newSidebarWidth,
        };
      });
    },
    [getSidebarWidth],
  );

  // サイドバーの実際の幅（px）を取得
  const getSidebarWidthPx = useCallback((): number => {
    switch (state.sidebarWidth) {
      case 'full':
        return 256;
      case 'collapsed':
        return 64;
      case 'hidden':
        return 0;
      default:
        return 0;
    }
  }, [state.sidebarWidth]);

  // モバイル判定（ドロワー表示用）
  const isMobile = currentBreakpoint === 'mobile';

  return {
    // レイアウト状態
    sidebarOpen: state.sidebarOpen,
    sidebarWidth: state.sidebarWidth,
    layoutMode: state.layoutMode,
    currentBreakpoint: state.currentBreakpoint,
    showHeader: state.showHeader,
    showSidebar: state.showSidebar,

    // レイアウトアクション
    toggleSidebar,
    setSidebarOpen,
    setLayoutMode,
    setShowHeader,
    setShowSidebar,

    // 計算値
    sidebarWidthPx: getSidebarWidthPx(),
    isMobile,

    // ユーティリティ
    isFullscreen: state.layoutMode === 'fullscreen',
    isCompact: state.layoutMode === 'compact' || currentBreakpoint === 'tablet',
    shouldShowDrawer: isMobile && state.sidebarOpen,
  };
}
