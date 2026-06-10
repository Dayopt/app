/**
 * Sentry連携システム
 *
 * 注意: Sentryの初期化は instrumentation.ts / instrumentation-client.ts で行われます。
 * このファイルはヘルパー関数のみを提供します。
 */

import * as Sentry from '@sentry/nextjs';

import { ServiceError } from '@/lib/trpc/errors';

const PII_KEYS = new Set([
  'email',
  'mail',
  'name',
  'phone',
  'address',
  'password',
  'token',
  'secret',
]);

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (PII_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * ServiceErrorをSentryに報告
 */
export function reportToSentry(error: ServiceError, userContext?: { userId?: string }): void {
  Sentry.withScope((scope) => {
    scope.setTag('errorCode', error.code);
    scope.setFingerprint(['dayopt', error.code]);
    scope.setContext('errorInfo', sanitizeMetadata({ code: error.code, message: error.message }));

    // GDPR データ最小化: 識別子(userId)のみ。ip / userAgent は載せない
    if (userContext?.userId) {
      scope.setUser({ id: userContext.userId });
    }

    Sentry.captureException(error);
  });
}

/**
 * エラーハンドラーユーティリティ
 */
export class SentryErrorHandler {
  /**
   * 汎用エラーハンドリング
   */
  static handleError(error: Error, context?: Record<string, unknown>): void {
    if (error instanceof ServiceError) {
      reportToSentry(error);
    } else {
      // 通常のErrorをServiceErrorに変換してレポート
      const serviceError = new ServiceError('INTERNAL_SERVER_ERROR', error.message);
      Sentry.withScope((scope) => {
        if (context) {
          scope.setContext('errorContext', sanitizeMetadata(context));
        }
        Sentry.captureException(serviceError);
      });
    }
  }

  /**
   * 操作コンテキストを設定
   */
  static setOperationContext(context: Record<string, unknown>): void {
    Sentry.setContext('operation', context);
  }

  /**
   * パンくずリストを追加
   */
  static addBreadcrumb(breadcrumb: {
    message: string;
    category?: string;
    level?: Sentry.SeverityLevel;
    data?: Record<string, unknown>;
  }): void {
    Sentry.addBreadcrumb(breadcrumb);
  }
}

/**
 * Reactコンポーネントのエラーハンドリング
 *
 * @example
 * ```typescript
 * class ErrorBoundary extends React.Component {
 *   componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
 *     handleReactError(error, errorInfo)
 *   }
 * }
 * ```
 */
export function handleReactError(
  error: Error,
  errorInfo?: { componentStack?: string | null },
): void {
  SentryErrorHandler.handleError(error, { errorInfo, type: 'react' });
}

/**
 * APIルートのエラーハンドリング
 *
 * @example
 * ```typescript
 * export async function GET(request: Request) {
 *   try {
 *     const data = await fetchData()
 *     return Response.json(data)
 *   } catch (error) {
 *     handleApiError(error as Error, { endpoint: '/api/data', method: 'GET' })
 *     return Response.json({ error: 'Internal Server Error' }, { status: 500 })
 *   }
 * }
 * ```
 */
export function handleApiError(error: Error, context?: Record<string, unknown>): void {
  SentryErrorHandler.handleError(error, { ...context, type: 'api' });
}

/**
 * Sentryの初期化状態を確認
 */
export function isSentryInitialized(): boolean {
  return !!Sentry.getClient();
}

// ─── Observability ヘルパー ──────────────────────────

/**
 * タグ値を文字列に正規化（Sentryタグは文字列のみ受付）
 */
function stringifyTags(tags: Record<string, string | number | boolean>): Record<string, string> {
  return Object.fromEntries(Object.entries(tags).map(([k, v]) => [k, String(v)]));
}

/**
 * ビジネスイベントをSentryに記録
 *
 * エラーではなく「重要な操作の成功/状態変化」を追跡するために使用。
 * Sentryの Issues > Search で `eventName:billing.checkout_started` のようにフィルタ可能。
 *
 * @example
 * ```typescript
 * captureBusinessEvent('billing.checkout_started', { priceId: 'price_xxx' })
 * captureBusinessEvent('account.deleted', {}, 'warning')
 * ```
 */
export function captureBusinessEvent(
  eventName: string,
  tags: Record<string, string | number | boolean>,
  level: Sentry.SeverityLevel = 'info',
): void {
  Sentry.captureMessage(eventName, {
    level,
    tags: { eventName, ...stringifyTags(tags) },
    fingerprint: ['dayopt', 'business-event', eventName],
  });
}

/**
 * ユーザー操作のbreadcrumbを追加
 *
 * エラー発生前の操作コンテキストを残すために使用。
 */
export function addUserActionBreadcrumb(
  message: string,
  data?: Record<string, unknown>,
  category = 'user.action',
): void {
  Sentry.addBreadcrumb({
    message,
    category,
    level: 'info',
    ...(data && { data }),
  });
}

/**
 * ユーザーのプランタグをグローバルに設定
 *
 * 以降のすべてのイベント/エラーに `user.plan` タグが付与される。
 */
export function setUserPlanTag(plan: string): void {
  Sentry.setTag('user.plan', plan);
}
