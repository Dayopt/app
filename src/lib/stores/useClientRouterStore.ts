import { create } from 'zustand';

type ClientPage = 'calendar' | 'stats';

interface ClientRouterState {
  /** null = サーバーレンダリングの children を表示 */
  clientPage: ClientPage | null;
  switchToPage: (page: ClientPage) => void;
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
export const useClientRouterStore = create<ClientRouterState>((set) => ({
  clientPage: null,
  switchToPage: (page) => set({ clientPage: page }),
  resetToServer: () => set({ clientPage: null }),
}));
