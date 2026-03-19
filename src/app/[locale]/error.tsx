'use client';

/**
 * Locale レベル Error ページ
 *
 * [locale] 配下の全 Route Group（(app), (auth), (onboarding)）の
 * エラーをキャッチする共通フォールバック。
 * 各 Route Group 固有の error.tsx がない場合にここに到達する。
 *
 * NextIntlClientProvider が利用可能なため i18n 対応。
 */

import { AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function LocaleError({ error, reset }: ErrorProps) {
  const t = useTranslations('error.global');

  useEffect(() => {
    logger.error('[Locale Error]', error);
  }, [error]);

  return (
    <div className="bg-background fixed inset-0 flex items-center justify-center overflow-auto p-4">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <div className="border-destructive flex size-16 items-center justify-center rounded-full border-2">
          <AlertCircle className="text-destructive size-8" />
        </div>

        <div>
          <h2 className="mb-2 text-xl font-bold">{t('title')}</h2>
          <p className="text-muted-foreground text-sm">{t('description')}</p>

          {process.env.NODE_ENV === 'development' && error.message && (
            <div className="border-border bg-surface-container mt-4 rounded-lg border p-4 text-left">
              <p className="text-destructive font-mono text-xs">{error.message}</p>
            </div>
          )}
        </div>

        <div className="flex gap-4">
          <Button onClick={reset}>{t('retry')}</Button>
          <Button onClick={() => (window.location.href = '/')} variant="outline">
            {t('goHome')}
          </Button>
        </div>

        <p className="text-muted-foreground text-xs">{t('sentryReport')}</p>
      </div>
    </div>
  );
}
