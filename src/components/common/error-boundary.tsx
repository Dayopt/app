/**
 * Sentry統合React Error Boundary
 * UIエラーの自動捕捉・分類・ユーザーセッション記録
 */

'use client';

import { Component, ErrorInfo, ReactNode } from 'react';

import { logger } from '@/lib/logger';
import { handleReactError, SentryErrorHandler } from '@/platform/sentry';
import { useTranslations } from 'next-intl';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * デフォルトのエラーフォールバックUI
 */
export function DefaultErrorFallback({
  onRetry,
  onReload,
}: {
  onRetry: () => void;
  onReload: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="border-destructive bg-surface-container rounded-2xl border p-6">
      <div className="text-center">
        <div className="text-destructive mb-4 text-6xl">⚠️</div>
        <h2 className="text-destructive mb-2 text-3xl font-bold tracking-tight">
          {t('error.boundary.title')}
        </h2>
        <p className="text-foreground mb-4">
          {t('error.boundary.description')}
          <br />
          {t('error.boundary.autoReport')}
        </p>
        <div className="flex justify-center gap-2">
          <button
            onClick={onRetry}
            className="bg-primary text-primary-foreground hover:bg-primary-hover rounded-lg px-4 py-2 transition-colors"
          >
            {t('error.boundary.retry')}
          </button>
          <button
            onClick={onReload}
            className="bg-surface-container text-muted-foreground hover:bg-state-hover rounded-lg px-4 py-2 transition-colors"
          >
            {t('error.boundary.reload')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 開発環境用フォールバックUI
 */
export function DevErrorFallback({ componentName }: { componentName?: string | undefined }) {
  const t = useTranslations();

  return (
    <div className="border-border bg-surface-container rounded-2xl border p-6">
      <h3 className="text-foreground mb-2 text-2xl font-bold tracking-tight">
        {t('error.boundary.devTitle')}
      </h3>
      <p className="text-foreground mb-2">
        {t('error.boundary.component')}: {componentName || t('error.boundary.unknown')}
      </p>
      <p className="text-muted-foreground text-sm">{t('error.boundary.checkConsole')}</p>
    </div>
  );
}

/**
 * 機能エラー用フォールバックUI
 */
export function FeatureErrorFallback({ featureName }: { featureName: string }) {
  const t = useTranslations();

  return (
    <div className="border-border bg-surface-container rounded-lg border p-4">
      <p className="text-foreground text-center">
        {t('error.boundary.featureError', { feature: featureName })}
      </p>
      <button
        onClick={() => window.location.reload()}
        className="bg-primary text-primary-foreground hover:bg-primary-hover mx-auto mt-2 block rounded-lg px-4 py-1 text-sm transition-colors"
      >
        {t('error.boundary.reload')}
      </button>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Sentryにエラーを送信（自動分類・優先度付き）
    handleReactError(error, errorInfo);

    // 操作コンテキストの記録
    SentryErrorHandler.setOperationContext({
      page: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
      action: 'component_error',
      feature: 'error_boundary',
      component_stack: errorInfo.componentStack,
    });

    // パンくずリスト記録
    SentryErrorHandler.addBreadcrumb({
      message: `React Error Boundary caught: ${error.message}`,
      category: 'error',
      level: 'error',
    });

    // カスタムエラーハンドラーがあれば呼び出し
    this.props.onError?.(error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      // カスタムフォールバックUIがあれば使用
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // デフォルトエラーUI
      return (
        <DefaultErrorFallback
          onRetry={() => this.setState({ hasError: false })}
          onReload={() => window.location.reload()}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * 開発環境用詳細エラー表示
 */
export function DetailedErrorBoundary({
  children,
  componentName,
}: {
  children: ReactNode;
  componentName?: string;
}) {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        logger.error(
          `🚨 Error in ${componentName || 'Unknown Component'}`,
          'Error:',
          error,
          'Component Stack:',
          errorInfo.componentStack,
        );
      }}
      fallback={
        process.env.NODE_ENV === 'development' ? (
          <DevErrorFallback componentName={componentName} />
        ) : undefined
      }
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * 特定機能用Error Boundary
 */
export function FeatureErrorBoundary({
  children,
  featureName,
  fallback,
}: {
  children: ReactNode;
  featureName: string;
  fallback?: ReactNode;
}) {
  return (
    <ErrorBoundary
      onError={(error) => {
        // 機能固有のエラーコンテキスト設定
        SentryErrorHandler.setOperationContext({
          page: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
          action: 'feature_error',
          feature: featureName,
          error_message: error.message,
        });
      }}
      fallback={fallback || <FeatureErrorFallback featureName={featureName} />}
    >
      {children}
    </ErrorBoundary>
  );
}
