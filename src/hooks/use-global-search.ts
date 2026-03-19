'use client';

/**
 * グローバル検索のコンテキストフック
 *
 * Provider は @/features/search/hooks/use-global-search に定義されている
 * このファイルは消費側（calendar等）からの import 用に Context と hook を提供する
 */

import { createContext, useContext } from 'react';

export interface GlobalSearchContextType {
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

const noop = () => {};
const fallback: GlobalSearchContextType = { open: noop, close: noop, isOpen: false };

export const GlobalSearchContext = createContext<GlobalSearchContextType | null>(null);

/** Provider外ではnoop fallbackを返す（Storybook等で安全に動作） */
export function useGlobalSearch(): GlobalSearchContextType {
  return useContext(GlobalSearchContext) ?? fallback;
}
