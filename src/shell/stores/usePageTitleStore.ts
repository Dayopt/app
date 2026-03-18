import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import { createSelectors } from '@/lib/zustand/createSelectors';

interface PageTitleState {
  /** 現在のページタイトル */
  title: string;
  /** ページタイトルをセット */
  setTitle: (title: string) => void;
  /** ページタイトルをクリア */
  clearTitle: () => void;
}

/**
 * ページタイトルを管理するStore
 *
 * レイアウト層のPageHeaderで使用し、各ページからタイトルをセットする
 *
 * @example
 * ```tsx
 * // PageHeader（レイアウト層）
 * const title = usePageTitleStore.use.title()
 *
 * // 各ページ（usePageTitleフック経由）
 * usePageTitle('Calendar')
 * ```
 */
const usePageTitleStoreBase = create<PageTitleState>()(
  devtools(
    (set) => ({
      title: '',
      setTitle: (title: string) => set({ title }),
      clearTitle: () => set({ title: '' }),
    }),
    {
      name: 'page-title-store',
      enabled: process.env.NODE_ENV !== 'production',
    },
  ),
);

// Auto-generated selectors でパフォーマンス最適化
export const usePageTitleStore = createSelectors(usePageTitleStoreBase);
