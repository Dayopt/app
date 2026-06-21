'use client';

import { useState } from 'react';

import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button, Card } from '@dayopt/components';

import { InstallBanner } from '@/lib/components/shell/InstallBanner';
import { IOSInstallGuide } from '@/lib/components/shell/IOSInstallGuide';
import { useInstallPrompt } from '@/lib/hooks/useInstallPrompt';
import { usePWAInit } from '@/lib/hooks/usePWA';
import { useServiceWorker } from '@/lib/hooks/useServiceWorker';

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

  // updateAvailable が一度 true になったら表示を維持（ユーザーが「後で」で閉じるまで）
  const [dismissed, setDismissed] = useState(false);
  const showUpdateBanner = updateAvailable && !dismissed;

  return (
    <>
      {children}

      {/* 更新バナー（インストールバナーより優先） */}
      {showUpdateBanner && (
        <div className="animate-in slide-in-from-bottom-4 fixed right-4 bottom-20 z-50 md:bottom-4">
          <Card className="bg-card border-border-subtle shadow-card flex-row items-center gap-4 rounded-2xl p-4 py-4">
            <RefreshCw className="text-primary h-5 w-5" />
            <div className="flex-1">
              <p className="text-foreground text-base font-normal md:text-sm">
                {t('updateAvailable')}
              </p>
              <p className="text-muted-foreground text-xs">{t('updateDescription')}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="text-muted-foreground hover:text-foreground text-base transition-colors md:text-sm"
              >
                {t('later')}
              </button>
              <Button onClick={applyUpdate} className="rounded-lg px-4 py-2 text-base md:text-sm">
                {t('update')}
              </Button>
            </div>
          </Card>
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
