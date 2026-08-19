'use client';

import { useEffect } from 'react';

import { InstallBanner } from '@/components/shell/InstallBanner';
import { IOSInstallGuide } from '@/components/shell/IOSInstallGuide';
import { useInstallPrompt } from '@/lib/hooks/useInstallPrompt';
import { usePWAInit } from '@/lib/hooks/usePWA';
import { useServiceWorker } from '@/lib/hooks/useServiceWorker';
import { useShellStore } from '@/lib/stores/useShellStore';

/**
 * Service Worker プロバイダー
 *
 * Service Workerの登録・PWAインストール促進・iOS対応を提供
 */
export function ServiceWorkerProvider({ children }: { children: React.ReactNode }) {
  // sw.js は install 時に skipWaiting で自動更新するが、開きっぱなしの画面には
  // 反映されない（#2232）。updateAvailable を shell store へ同期し、実際のバナー
  // 表示は useAppInlineBanner（app layout の flex column 内）に委ねる — ここ
  // （children より上位）で直接描画すると root レイアウトの高さ計算を崩しうるため
  const { updateAvailable } = useServiceWorker();
  const setServiceWorkerUpdateAvailable = useShellStore.use.setServiceWorkerUpdateAvailable();
  useEffect(() => {
    setServiceWorkerUpdateAvailable(updateAvailable);
  }, [updateAvailable, setServiceWorkerUpdateAvailable]);

  const { shouldShowBanner, promptInstall, dismissBanner, shouldShowIOSGuide, dismissIOSGuide } =
    useInstallPrompt();

  // PWA 共通初期化（iOS workarounds, SW keep-alive等）
  usePWAInit();

  return (
    <>
      {children}

      {/* インストール促進バナー */}
      {shouldShowBanner && <InstallBanner onInstall={promptInstall} onDismiss={dismissBanner} />}

      {/* iOS Safari 向けインストールガイド（Android/Chrome バナーとは排他表示） */}
      {!shouldShowBanner && shouldShowIOSGuide && <IOSInstallGuide onDismiss={dismissIOSGuide} />}
    </>
  );
}
