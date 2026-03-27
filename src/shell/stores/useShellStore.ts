'use client';

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import { createSelectors } from '@/lib/zustand/createSelectors';
import { platformStorage } from '@/lib/zustand/storage';
import type { SettingsCategory } from '@/types/settings';

// ── Sheet Types ──

/** シェルレベルのシート/ダイアログ（排他: 1つしか開かない） */
export type SheetType =
  | { type: 'mobileCreate' }
  | { type: 'contact' }
  | { type: 'settings'; category: SettingsCategory };

// ── State ──

interface ShellStoreState {
  /** サイドバー状態 */
  sidebar: {
    /** 開閉状態 */
    open: boolean;
    /** 幅（px）。将来のリサイズ対応用 */
    width: number;
  };

  /** ページタイトル（PageHeaderで表示） */
  pageTitle: string;

  /** アクティブなシート/ダイアログ（null = 全て閉じている） */
  activeSheet: SheetType | null;
}

// ── Actions ──

interface ShellStoreActions {
  // Sidebar
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;

  // Page title
  setPageTitle: (title: string) => void;
  clearPageTitle: () => void;

  // Sheets
  openSheet: (sheet: SheetType) => void;
  closeSheet: () => void;

  // Settings convenience（既存APIとの互換性）
  openSettings: (category?: SettingsCategory) => void;
  closeSettings: () => void;
  setSettingsCategory: (category: SettingsCategory) => void;
}

// ── Store ──

const DEFAULT_SIDEBAR_WIDTH = 256;

const useShellStoreBase = create<ShellStoreState & ShellStoreActions>()(
  devtools(
    persist(
      (set, get) => ({
        // ── Initial State ──
        sidebar: {
          open: true,
          width: DEFAULT_SIDEBAR_WIDTH,
        },
        pageTitle: '',
        activeSheet: null,

        // ── Sidebar Actions ──
        openSidebar: () =>
          set((state) => ({ sidebar: { ...state.sidebar, open: true } }), false, 'openSidebar'),
        closeSidebar: () =>
          set((state) => ({ sidebar: { ...state.sidebar, open: false } }), false, 'closeSidebar'),
        toggleSidebar: () =>
          set(
            (state) => ({ sidebar: { ...state.sidebar, open: !state.sidebar.open } }),
            false,
            'toggleSidebar',
          ),
        setSidebarWidth: (width) =>
          set((state) => ({ sidebar: { ...state.sidebar, width } }), false, 'setSidebarWidth'),

        // ── Page Title Actions ──
        setPageTitle: (title) => set({ pageTitle: title }, false, 'setPageTitle'),
        clearPageTitle: () => set({ pageTitle: '' }, false, 'clearPageTitle'),

        // ── Sheet Actions ──
        openSheet: (sheet) => set({ activeSheet: sheet }, false, 'openSheet'),
        closeSheet: () => set({ activeSheet: null }, false, 'closeSheet'),

        // ── Settings Convenience ──
        openSettings: (category = 'profile') =>
          set({ activeSheet: { type: 'settings', category } }, false, 'openSettings'),
        closeSettings: () => {
          const { activeSheet } = get();
          if (activeSheet?.type === 'settings') {
            set({ activeSheet: null }, false, 'closeSettings');
          }
        },
        setSettingsCategory: (category) => {
          const { activeSheet } = get();
          if (activeSheet?.type === 'settings') {
            set({ activeSheet: { type: 'settings', category } }, false, 'setSettingsCategory');
          }
        },
      }),
      {
        name: 'shell-storage',
        storage: platformStorage(),
        partialize: (state) => ({
          sidebar: state.sidebar,
        }),
      },
    ),
    { name: 'shell-store', enabled: process.env.NODE_ENV !== 'production' },
  ),
);

/**
 * シェルUI状態を統合管理するZustandストア
 *
 * 統合対象: useLayoutStore + usePageTitleStore + useMobileCreateSheetStore + useContactStore + useSettingsStore
 *
 * @example
 * ```tsx
 * // Sidebar
 * const isSidebarOpen = useShellStore.use.sidebar().open;
 * const toggleSidebar = useShellStore.use.toggleSidebar();
 *
 * // Page title
 * const pageTitle = useShellStore.use.pageTitle();
 *
 * // Sheets
 * const activeSheet = useShellStore.use.activeSheet();
 * const openSettings = useShellStore.use.openSettings();
 * ```
 */
export const useShellStore = createSelectors(useShellStoreBase);
