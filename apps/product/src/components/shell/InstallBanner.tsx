'use client';

import { Download, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@dayopt/components';

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
      <div className="bg-card border-border-subtle shadow-card flex items-center gap-2 rounded-2xl border p-4">
        <Download className="text-primary h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-base font-normal md:text-sm">
            {t('installTitle')}
          </p>
          <p className="text-muted-foreground text-xs">{t('installDescription')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" icon size="sm" onClick={onDismiss} aria-label={t('dismiss')}>
            <X className="size-4" />
          </Button>
          <Button size="sm" onClick={onInstall}>
            {t('install')}
          </Button>
        </div>
      </div>
    </div>
  );
}
