'use client';

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import { createSelectors } from '@/lib/zustand/createSelectors';

interface LayoutStoreState {
  // ── Sidebar ──
  /** Sidebarの開閉状態 */
  sidebarOpen: boolean;
  /** Sidebarを開く */
  openSidebar: () => void;
  /** Sidebarを閉じる */
  closeSidebar: () => void;
  /** Sidebarの開閉をトグル */
  toggleSidebar: () => void;
}

/**
 * レイアウトStore
 *
 * サイドバーの開閉状態を管理する。
 *
 * @example
 * ```tsx
 * const sidebarOpen = useLayoutStore.use.sidebarOpen();
 * const toggleSidebar = useLayoutStore.use.toggleSidebar();
 * ```
 */
const useLayoutStoreBase = create<LayoutStoreState>()(
  devtools(
    persist(
      (set) => ({
        // ── Sidebar ──
        sidebarOpen: true,
        openSidebar: () => set({ sidebarOpen: true }),
        closeSidebar: () => set({ sidebarOpen: false }),
        toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      }),
      {
        name: 'layout-storage',
        partialize: (state) => ({
          sidebarOpen: state.sidebarOpen,
        }),
      },
    ),
    { name: 'layout-store', enabled: process.env.NODE_ENV !== 'production' },
  ),
);

export const useLayoutStore = createSelectors(useLayoutStoreBase);
