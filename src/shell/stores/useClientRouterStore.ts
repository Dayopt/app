import { create } from 'zustand';

type ClientPage = 'calendar' | 'stats';

interface ClientRouterState {
  /** null = サーバーレンダリングの children を表示 */
  clientPage: ClientPage | null;
  /** Stats タグドリルダウン用の待機 tagId（遷移時にセット、Stats 側で消費） */
  pendingTagId: string | null;
  switchToPage: (page: ClientPage) => void;
  /** Stats ページにタグドリルダウンで遷移 */
  switchToTagStats: (tagId: string) => void;
  /** pendingTagId を消費（Stats 側が呼ぶ） */
  consumePendingTag: () => string | null;
  resetToServer: () => void;
}

/**
 * クライアントサイドページ切り替え用ストア
 *
 * PageNav が pushState + switchToPage() でページ遷移を行い、
 * ClientPageRenderer がこのストアを読んで Calendar / Stats を
 * クライアントサイドでレンダリングする。
 *
 * 初回ロード / リロード時は null（サーバーレンダリングの children を使用）。
 */
export const useClientRouterStore = create<ClientRouterState>((set, get) => ({
  clientPage: null,
  pendingTagId: null,
  switchToPage: (page) => set({ clientPage: page }),
  switchToTagStats: (tagId) => set({ clientPage: 'stats', pendingTagId: tagId }),
  consumePendingTag: () => {
    const { pendingTagId } = get();
    if (pendingTagId) set({ pendingTagId: null });
    return pendingTagId;
  },
  resetToServer: () => set({ clientPage: null, pendingTagId: null }),
}));
