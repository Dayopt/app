'use client';

import { useState } from 'react';

import { InstallBanner } from '@/components/shell/InstallBanner';
import { IOSInstallGuide } from '@/components/shell/IOSInstallGuide';
import { UpdateBanner } from '@/components/shell/UpdateBanner';
import { useInstallPrompt } from '@/lib/hooks/useInstallPrompt';
import { usePWAInit } from '@/lib/hooks/usePWA';
import { useServiceWorker } from '@/lib/hooks/useServiceWorker';

/**
 * Service Worker プロバイダー
 *
 * Service Workerの登録・更新通知UI・PWAインストール促進・iOS対応を提供
 */
export function ServiceWorkerProvider({ children }: { children: React.ReactNode }) {
  const { updateAvailable, applyUpdate } = useServiceWorker();
  const { shouldShowBanner, promptInstall, dismissBanner, shouldShowIOSGuide, dismissIOSGuide } =
    useInstallPrompt();

  // PWA 共通初期化（iOS workarounds, SW keep-alive等）
  usePWAInit();

  // updateAvailable が一度 true になったら表示を維持（ユーザーが「後で」で閉じるまで）
  const [dismissed, setDismissed] = useState(false);
  const showUpdateBanner = updateAvailable && !dismissed;

  return (
    <>
      {children}

      {/* 更新バナー（インストールバナーより優先） */}
      {showUpdateBanner && (
        <UpdateBanner onUpdate={applyUpdate} onDismiss={() => setDismissed(true)} />
      )}

      {/* インストール促進バナー（更新バナーが表示中は非表示） */}
      {!showUpdateBanner && shouldShowBanner && (
        <InstallBanner onInstall={promptInstall} onDismiss={dismissBanner} />
      )}

      {/* iOS Safari 向けインストールガイド（Android/Chrome バナーとは排他表示） */}
      {!showUpdateBanner && !shouldShowBanner && shouldShowIOSGuide && (
        <IOSInstallGuide onDismiss={dismissIOSGuide} />
      )}
    </>
  );
}
