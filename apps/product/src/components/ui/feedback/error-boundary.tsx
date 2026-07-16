/**
 * Sentry統合React Error Boundary
 * UIエラーの自動捕捉・分類・ユーザーセッション記録
 */

'use client';

import { Component, ErrorInfo, ReactNode } from 'react';

import { handleReactError } from '@/lib/sentry';
import { useTranslations } from 'next-intl';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  featureName?: string;
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
        <h2 className="text-destructive mb-2 text-3xl font-medium tracking-tight">
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
      <h3 className="text-foreground mb-2 text-2xl font-medium tracking-tight">
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

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Sentryにエラーを送信（自動分類・優先度付き）
    handleReactError(error, errorInfo, {
      route: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
      operation: 'component_render',
      feature: this.props.featureName ?? 'error_boundary',
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
      featureName={featureName}
      fallback={fallback || <FeatureErrorFallback featureName={featureName} />}
    >
      {children}
    </ErrorBoundary>
  );
}
