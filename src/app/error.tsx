/**
 * ルートレベル Error ページ
 *
 * Route Group外でエラーが発生した場合に表示。
 * NextIntlClientProviderが利用できないため、静的英語テキストを使用。
 * global-error.tsx と統一されたカード型デザイン + Sentry連携。
 */
'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import * as Sentry from '@sentry/nextjs';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

const ERROR_TEXT = {
  title: 'Something went wrong',
  description: 'We apologize for the inconvenience. An unexpected error occurred.',
  errorId: 'Error ID',
  showDetails: 'Show details',
  retry: 'Try again',
  goHome: 'Go to Home',
  sentryReport: 'This error has been automatically reported.',
};

export default function RootError({ error, reset }: ErrorProps) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: {
        error_boundary: 'root_error',
        error_type: 'react_render_error',
      },
      contexts: {
        react_error: {
          componentStack: error.stack,
          digest: error.digest,
          message: error.message,
        },
      },
    });
  }, [error]);

  return (
    <div className="bg-background fixed inset-0 flex items-center justify-center overflow-auto p-4">
      <div className="bg-card border-border-subtle w-full max-w-md rounded-2xl border p-8 shadow-sm">
        <div className="mb-6">
          <h1 className="text-destructive mb-2 text-2xl font-bold">{ERROR_TEXT.title}</h1>
          <p className="text-muted-foreground">{ERROR_TEXT.description}</p>
        </div>

        {error.digest && (
          <div className="bg-surface-container mb-4 rounded p-4 text-xs">
            <p className="text-muted-foreground">
              {ERROR_TEXT.errorId}: <code className="font-mono">{error.digest}</code>
            </p>
          </div>
        )}

        {process.env.NODE_ENV === 'development' && (
          <details className="mb-6">
            <summary className="text-muted-foreground hover:bg-state-hover -mx-1 cursor-pointer rounded px-1 text-sm transition-colors">
              {ERROR_TEXT.showDetails}
            </summary>
            <div className="bg-surface-container mt-4 rounded p-4">
              <p className="mb-2 text-xs font-bold">{error.name}</p>
              <pre className="text-muted-foreground max-h-40 overflow-auto text-xs">
                {error.message}
              </pre>
            </div>
          </details>
        )}

        <div className="space-y-4">
          <Button onClick={reset} className="w-full">
            {ERROR_TEXT.retry}
          </Button>

          <Button variant="outline" onClick={() => (window.location.href = '/')} className="w-full">
            {ERROR_TEXT.goHome}
          </Button>
        </div>

        <p className="text-muted-foreground mt-6 text-center text-xs">{ERROR_TEXT.sentryReport}</p>
      </div>
    </div>
  );
}
