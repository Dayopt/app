'use client';

import { useEffect } from 'react';

import { useShellStore } from '@/lib/stores/useShellStore';

import { registerShortcut } from './shortcut-registry';

/** Cmd/Ctrl+K からシェルのブロック検索を開く。 */
export function useTimeblockSearchShortcut(): void {
  const openTimeblockSearch = useShellStore.use.openTimeblockSearch();

  useEffect(
    () =>
      registerShortcut({
        key: 'Cmd+K',
        description: 'Open timeblock search',
        priority: 100,
        handler: (event) => {
          event.preventDefault();
          openTimeblockSearch();
        },
      }),
    [openTimeblockSearch],
  );
}
