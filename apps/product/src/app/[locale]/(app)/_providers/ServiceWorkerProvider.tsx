'use client';

import { InstallBanner } from '@/components/shell/InstallBanner';
import { IOSInstallGuide } from '@/components/shell/IOSInstallGuide';
import { useInstallPrompt } from '@/lib/hooks/useInstallPrompt';
import { usePWAInit } from '@/lib/hooks/usePWA';
import { useServiceWorker } from '@/lib/hooks/useServiceWorker';

/**
 * Service Worker プロバイダー
 *
 * Service Workerの登録・PWAインストール促進・iOS対応を提供
 */
export function ServiceWorkerProvider({ children }: { children: React.ReactNode }) {
  // Service Worker 自体の登録（sw.js が skipWaiting で自動更新するため、更新通知 UI は持たない）
  useServiceWorker();
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
