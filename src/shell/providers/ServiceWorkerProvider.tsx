'use client';

import { useState } from 'react';

import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useNotificationBadge } from '@/features/notifications/hooks/useNotificationBadge';

import { InstallBanner } from '../components/InstallBanner';
import { IOSInstallGuide } from '../components/IOSInstallGuide';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { useOfflineToast } from '../hooks/useOfflineToast';
import { usePWAInit } from '../hooks/usePWA';
import { useServiceWorker } from '../hooks/useServiceWorker';
import { useSyncProcessor } from '../hooks/useSyncProcessor';

/**
 * Service Worker プロバイダー
 *
 * Service Workerの登録・更新通知UI・PWAインストール促進・iOS対応を提供
 */
export function ServiceWorkerProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common.serviceWorker');
  const { updateAvailable, applyUpdate } = useServiceWorker();
  const { shouldShowBanner, promptInstall, dismissBanner, shouldShowIOSGuide, dismissIOSGuide } =
    useInstallPrompt();

  // PWA 共通初期化（iOS workarounds, SW keep-alive等）
  usePWAInit();

  // 同期プロセッサー初期化（tRPC vanillaクライアント経由でオフラインmutationを再送）
  useSyncProcessor();

  // 通知未読数をPWA App Badgeに反映
  useNotificationBadge();

  // オフライン/オンライン切り替え時のtoast通知
  useOfflineToast();

  // updateAvailable が一度 true になったら表示を維持（ユーザーが「後で」で閉じるまで）
  const [dismissed, setDismissed] = useState(false);
  const showUpdateBanner = updateAvailable && !dismissed;

  return (
    <>
      {children}

      {/* 更新バナー（インストールバナーより優先） */}
      {showUpdateBanner && (
        <div className="animate-in slide-in-from-bottom-4 fixed right-4 bottom-20 z-50 md:bottom-4">
          <div className="bg-card border-border-subtle shadow-card flex items-center gap-4 rounded-2xl border p-4">
            <RefreshCw className="text-primary h-5 w-5" />
            <div className="flex-1">
              <p className="text-foreground text-sm font-normal">{t('updateAvailable')}</p>
              <p className="text-muted-foreground text-xs">{t('updateDescription')}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="text-muted-foreground hover:text-foreground text-sm transition-colors"
              >
                {t('later')}
              </button>
              <button
                type="button"
                onClick={applyUpdate}
                className="bg-primary text-primary-foreground hover:bg-primary-hover rounded-lg px-4 py-2 text-sm font-normal transition-colors"
              >
                {t('update')}
              </button>
            </div>
          </div>
        </div>
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
