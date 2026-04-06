'use client';

import { Share, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface IOSInstallGuideProps {
  onDismiss: () => void;
}

/**
 * iOS Safari 向け PWA インストール手順ガイド
 *
 * iOS は `beforeinstallprompt` を発火しないため、
 * ユーザーに「共有 → ホーム画面に追加」の手順を案内する。
 *
 * 表示条件:
 * - iOS Safari である
 * - standalone モードでない（未インストール）
 * - ユーザーが dismiss していない
 */
export function IOSInstallGuide({ onDismiss }: IOSInstallGuideProps) {
  const t = useTranslations('common.pwa');

  return (
    <div className="animate-in slide-in-from-bottom-4 fixed right-4 bottom-20 left-4 z-50 md:bottom-4 md:left-auto md:w-96">
      <div className="bg-card border-border-subtle shadow-card rounded-2xl border p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <p className="text-foreground text-base md:text-sm">{t('iosInstallTitle')}</p>
          <button
            type="button"
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground shrink-0 p-1 transition-colors"
            aria-label={t('dismiss')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-muted-foreground mb-2 text-xs">{t('iosInstallDescription')}</p>
        {/* 手順リスト */}
        <ol className="text-foreground space-y-2 text-xs">
          <li className="flex items-center gap-2">
            <span className="bg-muted text-muted-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs">
              1
            </span>
            <span className="flex items-center gap-1">
              {t('iosStep1')}
              <Share className="inline-block h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="bg-muted text-muted-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs">
              2
            </span>
            <span>{t('iosStep2')}</span>
          </li>
        </ol>
      </div>
    </div>
  );
}
