'use client';

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { GlobalSearchContext } from '@/lib/hooks/use-global-search';
import { GlobalSearchModal } from '../components/global-search-modal';

// Re-export for backward compatibility
export { useGlobalSearch } from '@/lib/hooks/use-global-search';
export type { GlobalSearchContextType } from '@/lib/hooks/use-global-search';

/** グローバル検索コンテキストを提供するプロバイダー（Cmd/Ctrl+K キーボードショートカット付き） */
export const GlobalSearchProvider = ({ children }: { children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  const contextValue = useMemo(
    () => ({
      open,
      close,
      isOpen,
    }),
    [open, close, isOpen],
  );

  return (
    <GlobalSearchContext.Provider value={contextValue}>
      {children}
      <GlobalSearchModal isOpen={isOpen} onClose={close} />
    </GlobalSearchContext.Provider>
  );
};
