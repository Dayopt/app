'use client';

import { useState } from 'react';

import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useServiceWorker } from '../hooks/useServiceWorker';

/**
 * Service Worker プロバイダー
 *
 * Service Workerの登録と更新通知UIを提供
 */
export function ServiceWorkerProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common.serviceWorker');
  const { updateAvailable, applyUpdate } = useServiceWorker();
  // updateAvailable が一度 true になったら表示を維持（ユーザーが「後で」で閉じるまで）
  const [dismissed, setDismissed] = useState(false);
  const showUpdateBanner = updateAvailable && !dismissed;

  return (
    <>
      {children}

      {/* 更新バナー */}
      {showUpdateBanner && (
        <div className="animate-in slide-in-from-bottom-4 fixed right-4 bottom-20 z-50 md:bottom-4">
          <div className="bg-card border-border surface-raised flex items-center gap-4 rounded-2xl border p-4">
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
    </>
  );
}
