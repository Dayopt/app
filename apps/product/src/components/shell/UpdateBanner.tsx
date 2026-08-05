'use client';

import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button, Card } from '@dayopt/components';

interface UpdateBannerProps {
  onUpdate: () => void;
  onDismiss: () => void;
}

/**
 * Service Worker 更新通知バナー
 *
 * 新しいバージョンが利用可能になった時に、
 * 適用（更新）または後回し（後で）を促すバナーを表示する。
 */
export function UpdateBanner({ onUpdate, onDismiss }: UpdateBannerProps) {
  const t = useTranslations('common.serviceWorker');

  return (
    <div className="animate-in slide-in-from-bottom-4 fixed right-4 bottom-20 z-50 md:bottom-4">
      <Card className="bg-card border-border-subtle shadow-card flex-row items-center gap-4 rounded-2xl p-4 py-4">
        <RefreshCw className="text-primary h-5 w-5" />
        <div className="flex-1">
          <p className="text-foreground text-base font-normal md:text-sm">{t('updateAvailable')}</p>
          <p className="text-muted-foreground text-xs">{t('updateDescription')}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground text-base transition-colors md:text-sm"
          >
            {t('later')}
          </button>
          <Button onClick={onUpdate} className="rounded-lg px-4 py-2 text-base md:text-sm">
            {t('update')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
