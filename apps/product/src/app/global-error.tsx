'use client';

/**
 * Global Error Handler - Sentry統合
 *
 * Next.js App Router のグローバルエラーハンドラー
 * Root Layout 自体が壊れた時に発動するため、独自の <html><body> を持つ。
 *
 * 重要:
 * - Root Layout が描画されないため、Tailwind CSS変数が利用不可の場合がある
 * - <style> タグでデザインシステムのOKLCHトークン相当のCSS変数を定義
 * - NextIntlClientProvider が利用不可のため静的英語テキストを使用
 */

import { useEffect } from 'react';

import { captureClientBoundaryError } from '@/lib/sentry';

import { ErrorButton } from './_global-error/ErrorButton';
import { ERROR_TEXT, FALLBACK_STYLES } from './_global-error/fallback-content';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    captureClientBoundaryError(error, {
      feature: 'root_layout',
      operation: 'render',
      route: window.location.pathname,
      source: 'global_error_boundary',
    });
  }, [error]);

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style dangerouslySetInnerHTML={{ __html: FALLBACK_STYLES }} />
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: 'var(--ge-background)',
          color: 'var(--ge-foreground)',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            minHeight: '100vh',
            width: '100%',
            padding: '1rem',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '28rem',
              backgroundColor: 'var(--ge-card)',
              border: '1px solid var(--ge-border)',
              borderRadius: '1rem',
              padding: '2rem',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ marginBottom: '1.5rem' }}>
              <h1
                style={{
                  color: 'var(--ge-destructive)',
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  marginTop: 0,
                  marginBottom: '0.5rem',
                }}
              >
                {ERROR_TEXT.title}
              </h1>
              <p style={{ color: 'var(--ge-muted)', margin: 0, lineHeight: 1.5 }}>
                {ERROR_TEXT.description}
              </p>
            </div>

            {error.digest && (
              <div
                style={{
                  backgroundColor: 'var(--ge-card-inset)',
                  borderRadius: '0.375rem',
                  padding: '1rem',
                  marginBottom: '1rem',
                  fontSize: '0.75rem',
                }}
              >
                <p style={{ color: 'var(--ge-muted)', margin: 0 }}>
                  {ERROR_TEXT.errorId}:{' '}
                  <code style={{ fontFamily: 'monospace' }}>{error.digest}</code>
                </p>
              </div>
            )}

            {process.env.NODE_ENV === 'development' && (
              <details style={{ marginBottom: '1.5rem' }}>
                <summary
                  style={{
                    color: 'var(--ge-muted)',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    padding: '0.25rem',
                  }}
                >
                  {ERROR_TEXT.showDetails}
                </summary>
                <div
                  style={{
                    backgroundColor: 'var(--ge-card-inset)',
                    borderRadius: '0.375rem',
                    padding: '1rem',
                    marginTop: '1rem',
                  }}
                >
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                    {error.name}
                  </p>
                  <pre
                    style={{
                      color: 'var(--ge-muted)',
                      fontSize: '0.75rem',
                      maxHeight: '10rem',
                      overflow: 'auto',
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {error.message}
                  </pre>
                </div>
              </details>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <ErrorButton onClick={reset}>{ERROR_TEXT.retry}</ErrorButton>
              <ErrorButton variant="outline" onClick={() => (window.location.href = '/')}>
                {ERROR_TEXT.goHome}
              </ErrorButton>
            </div>

            <p
              style={{
                color: 'var(--ge-muted)',
                fontSize: '0.75rem',
                textAlign: 'center',
                marginTop: '1.5rem',
                marginBottom: 0,
              }}
            >
              {ERROR_TEXT.recoveryHint}
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
