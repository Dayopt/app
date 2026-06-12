'use client';

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import type { SettingsCategory } from '@/lib/types/settings';
import { createSelectors } from '@/lib/zustand/createSelectors';
import { platformStorage } from '@/lib/zustand/storage';

// ── Sheet Types ──

/** タグマージモーダルで渡す source tag の identity */
interface TagMergeSourceTag {
  id: string;
  name: string;
  color?: string | null;
}

/** タグリネームモーダルで渡す対象タグの identity */
export interface TagRenameTarget {
  id: string;
  name: string;
  parent_id: string | null;
}

/** タグ新規作成 modal の onCreated に渡される最小限の tag 情報（feature 依存を避ける plain shape） */
export interface CreatedTagPayload {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  parent_id: string | null;
}

/**
 * タグ新規作成モーダルの context。
 * `onCreated` は serializable ではないため persist には乗せない（partialize で除外済）。
 */
export interface TagCreateContext {
  /** 初期選択親タグ（null = ルート） */
  initialParentId: string | null;
  /**
   * 作成成功時のコールバック。caller が selection 反映や後続処理を行うのに使う。
   */
  onCreated?: (tag: CreatedTagPayload) => void;
}

/**
 * シェルレベルのシート/ダイアログ（排他: 1つしか開かない）
 *
 * `contact` / `settings` は Sheet 系、`tagMerge` / `tagRename` / `tagCreate` は Modal 系だが、
 * shell 全体で「1 つしか開かない overlay」として統一管理する（旧 useModalStore
 * を統合、P2-2）。
 */
type SheetType =
  | { type: 'contact' }
  | { type: 'settings'; category: SettingsCategory }
  | { type: 'tagMerge'; sourceTag: TagMergeSourceTag }
  | { type: 'tagRename'; tag: TagRenameTarget }
  | { type: 'tagCreate'; context: TagCreateContext };

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

  // Tag merge modal convenience
  openTagMergeModal: (sourceTag: TagMergeSourceTag) => void;
  closeTagMergeModal: () => void;

  // Tag rename modal convenience
  openTagRenameModal: (tag: TagRenameTarget) => void;
  closeTagRenameModal: () => void;

  // Tag create modal convenience
  openTagCreateModal: (context?: Partial<TagCreateContext>) => void;
  closeTagCreateModal: () => void;
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

        // ── Tag Merge Modal Convenience ──
        openTagMergeModal: (sourceTag) =>
          set({ activeSheet: { type: 'tagMerge', sourceTag } }, false, 'openTagMergeModal'),
        closeTagMergeModal: () => {
          const { activeSheet } = get();
          if (activeSheet?.type === 'tagMerge') {
            set({ activeSheet: null }, false, 'closeTagMergeModal');
          }
        },

        // ── Tag Rename Modal Convenience ──
        openTagRenameModal: (tag) =>
          set({ activeSheet: { type: 'tagRename', tag } }, false, 'openTagRenameModal'),
        closeTagRenameModal: () => {
          const { activeSheet } = get();
          if (activeSheet?.type === 'tagRename') {
            set({ activeSheet: null }, false, 'closeTagRenameModal');
          }
        },

        // ── Tag Create Modal Convenience ──
        openTagCreateModal: (context) =>
          set(
            {
              activeSheet: {
                type: 'tagCreate',
                context: {
                  initialParentId: context?.initialParentId ?? null,
                  ...(context?.onCreated ? { onCreated: context.onCreated } : {}),
                },
              },
            },
            false,
            'openTagCreateModal',
          ),
        closeTagCreateModal: () => {
          const { activeSheet } = get();
          if (activeSheet?.type === 'tagCreate') {
            set({ activeSheet: null }, false, 'closeTagCreateModal');
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
 * 統合対象: useLayoutStore + usePageTitleStore + useContactStore + useSettingsStore
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
