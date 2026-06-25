'use client';

import { useEffect } from 'react';

import { AlertCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { logger } from '@/lib/logger';
import { Button } from '@dayopt/components';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * カレンダーページ用エラーバウンダリ
 *
 * SSR prefetch失敗時やランタイムエラー時に表示される。
 * FeatureErrorBoundary（クライアント側）より上位で捕捉。
 */
export function CalendarError({ error, reset }: ErrorProps) {
  const t = useTranslations('calendar.error');

  useEffect(() => {
    logger.error('[Calendar Error]', error);
  }, [error]);

  return (
    // eslint-disable-next-line tailwindcss/no-arbitrary-value -- viewport unit
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 p-8">
      <div className="border-destructive flex size-16 items-center justify-center rounded-full border-2">
        <AlertCircle className="text-destructive size-8" />
      </div>

      <div className="max-w-md text-center">
        <h2 className="mb-2 text-xl font-medium">{t('title')}</h2>
        <p className="text-muted-foreground text-sm">{t('description')}</p>

        {process.env.NODE_ENV === 'development' && error.message && (
          <div className="border-border bg-surface-container mt-4 rounded-lg border p-4 text-left">
            <p className="text-destructive font-mono text-xs">{error.message}</p>
          </div>
        )}
      </div>

      <div className="flex gap-4">
        <Button onClick={reset} variant="primary">
          {t('retry')}
        </Button>
        <Button onClick={() => window.location.reload()} variant="outline">
          {t('reload')}
        </Button>
      </div>
    </div>
  );
}
