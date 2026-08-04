'use client';

/**
 * useShortcutRegistry
 *
 * グローバルkeydownリスナーを1つだけ登録し、shortcut-registryを通じてハンドラを呼び出す。
 * アプリ内で1箇所だけ呼び出す（CalendarController等）。
 *
 * モバイル環境ではリスナーを登録しない。
 */

import { useEffect } from 'react';

import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { handleGlobalKeyDown, registerShortcut } from '@/lib/keyboard/shortcut-registry';
import { useShellStore } from '@/lib/stores/useShellStore';

/**
 * ショートカットレジストリのグローバルリスナーをマウントする
 *
 * モバイルではキーボードショートカットを無効化する。
 */
export function useShortcutRegistry(): void {
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);

  useEffect(() => {
    if (isMobile) return;

    const unregisterCheatSheet = registerShortcut({
      key: 'Shift+?',
      description: 'ショートカット一覧を開く',
      priority: 100,
      handler: (event) => {
        event.preventDefault();
        useShellStore.getState().openSheet({ type: 'shortcutCheatSheet' });
      },
    });

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      unregisterCheatSheet();
    };
  }, [isMobile]);
}
