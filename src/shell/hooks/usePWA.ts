'use client';

import { useEffect } from 'react';

import {
  fixIOSViewportHeight,
  patchExternalLinks,
  preventStandaloneNavLoss,
  startSWKeepAlive,
} from '@/lib/pwa/ios-workarounds';

/**
 * PWA 共通初期化フック
 *
 * iOS固有のワークアラウンドやSW keep-alive等、
 * アプリ起動時に1度だけ実行する処理をまとめる。
 */
export function usePWAInit(): void {
  useEffect(() => {
    const cleanups = [
      startSWKeepAlive(),
      patchExternalLinks(),
      fixIOSViewportHeight(),
      preventStandaloneNavLoss(),
    ];

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);
}
