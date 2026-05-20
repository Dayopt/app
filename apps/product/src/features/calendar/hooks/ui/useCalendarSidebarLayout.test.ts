import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useCalendarSidebarLayout } from './useCalendarSidebarLayout';

describe('useCalendarSidebarLayout', () => {
  beforeEach(() => {
    // LocalStorageのモック
    const localStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
          store[key] = value;
        },
        clear: () => {
          store = {};
        },
      };
    })();

    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    // window.innerWidthのモック（desktop）
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1280,
    });
  });

  describe('初期化', () => {
    it('デフォルト値で初期化される', () => {
      const { result } = renderHook(() => useCalendarSidebarLayout());

      expect(result.current.sidebarOpen).toBe(true);
      expect(result.current.layoutMode).toBe('default');
    });
  });

  describe('サイドバー操作', () => {
    it('toggleSidebarでサイドバーが開閉する', () => {
      const { result } = renderHook(() => useCalendarSidebarLayout({ sidebarDefaultOpen: true }));

      expect(result.current.sidebarOpen).toBe(true);

      act(() => {
        result.current.toggleSidebar();
      });

      expect(result.current.sidebarOpen).toBe(false);

      act(() => {
        result.current.toggleSidebar();
      });

      expect(result.current.sidebarOpen).toBe(true);
    });

    it('setSidebarOpenで直接サイドバー状態を設定できる', () => {
      const { result } = renderHook(() => useCalendarSidebarLayout({ sidebarDefaultOpen: true }));

      act(() => {
        result.current.setSidebarOpen(false);
      });

      expect(result.current.sidebarOpen).toBe(false);

      act(() => {
        result.current.setSidebarOpen(true);
      });

      expect(result.current.sidebarOpen).toBe(true);
    });
  });

  describe('レイアウトモード', () => {
    it('レイアウトモードを変更できる', () => {
      const { result } = renderHook(() => useCalendarSidebarLayout());

      expect(result.current.layoutMode).toBe('default');

      act(() => {
        result.current.setLayoutMode('compact');
      });

      expect(result.current.layoutMode).toBe('compact');

      act(() => {
        result.current.setLayoutMode('fullscreen');
      });

      expect(result.current.layoutMode).toBe('fullscreen');
    });

    it('fullscreenモードではヘッダーとサイドバーが非表示になる', () => {
      const { result } = renderHook(() => useCalendarSidebarLayout());

      act(() => {
        result.current.setLayoutMode('fullscreen');
      });

      expect(result.current.layoutMode).toBe('fullscreen');
      expect(result.current.showHeader).toBe(false);
      expect(result.current.showSidebar).toBe(false);
      expect(result.current.isFullscreen).toBe(true);
    });
  });

  describe('LocalStorage永続化', () => {
    it('サイドバー状態がLocalStorageに保存される', () => {
      const { result } = renderHook(() =>
        useCalendarSidebarLayout({
          sidebarDefaultOpen: true,
          persistSidebarState: true,
        }),
      );

      act(() => {
        result.current.setSidebarOpen(false);
      });

      expect(window.localStorage.getItem('calendar-sidebar-collapsed')).toBe('false');

      act(() => {
        result.current.setSidebarOpen(true);
      });

      expect(window.localStorage.getItem('calendar-sidebar-collapsed')).toBe('true');
    });

    it('カスタムストレージキーを使用できる', () => {
      const { result } = renderHook(() =>
        useCalendarSidebarLayout({
          sidebarDefaultOpen: true,
          persistSidebarState: true,
          sidebarStorageKey: 'custom-sidebar-key',
        }),
      );

      act(() => {
        result.current.setSidebarOpen(false);
      });

      expect(window.localStorage.getItem('custom-sidebar-key')).toBe('false');
    });
  });

  describe('レスポンシブ判定', () => {
    it('デスクトップ幅でdesktop breakpointになる', () => {
      window.innerWidth = 1280;
      const { result } = renderHook(() => useCalendarSidebarLayout());

      expect(result.current.currentBreakpoint).toBe('desktop');
      expect(result.current.isMobile).toBe(false);
    });

    it('タブレット幅でtablet breakpointになる', () => {
      window.innerWidth = 800;
      const { result } = renderHook(() => useCalendarSidebarLayout());

      act(() => {
        window.dispatchEvent(new Event('resize'));
      });

      expect(result.current.currentBreakpoint).toBe('tablet');
      expect(result.current.isCompact).toBe(true);
    });

    it('モバイル幅でmobile breakpointになる', () => {
      window.innerWidth = 600;
      const { result } = renderHook(() => useCalendarSidebarLayout());

      act(() => {
        window.dispatchEvent(new Event('resize'));
      });

      expect(result.current.currentBreakpoint).toBe('mobile');
      expect(result.current.isMobile).toBe(true);
    });
  });
});
