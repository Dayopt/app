'use client';

import { Download, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface InstallBannerProps {
  onInstall: () => void;
  onDismiss: () => void;
}

/**
 * PWA インストール促進バナー
 *
 * モバイルブラウザでアクセスしたユーザーに
 * 「ホーム画面に追加」を促すバナーを表示する。
 */
export function InstallBanner({ onInstall, onDismiss }: InstallBannerProps) {
  const t = useTranslations('common.pwa');

  return (
    <div className="animate-in slide-in-from-bottom-4 fixed right-4 bottom-20 left-4 z-50 md:bottom-4 md:left-auto md:w-96">
      <div className="bg-card border-border surface-raised flex items-center gap-3 rounded-2xl border p-4">
        <Download className="text-primary h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-sm font-normal">{t('installTitle')}</p>
          <p className="text-muted-foreground text-xs">{t('installDescription')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground p-1 transition-colors"
            aria-label={t('dismiss')}
          >
            <X className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onInstall}
            className="bg-primary text-primary-foreground hover:bg-primary-hover rounded-lg px-4 py-2 text-sm font-normal transition-colors"
          >
            {t('install')}
          </button>
        </div>
      </div>
    </div>
  );
}
