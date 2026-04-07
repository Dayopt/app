/**
 * Sentry連携システム
 * エラーパターン辞書との統合による自動分類・構造化レポーティング
 *
 * 注意: Sentryの初期化は instrumentation.ts / instrumentation-client.ts で行われます。
 * このファイルはヘルパー関数のみを提供します。
 */

import * as Sentry from '@sentry/nextjs';

import { AppError, type ErrorCategory, type SeverityLevel } from '@/lib/errors/error-patterns';

/**
 * カテゴリ別Sentryタグ設定
 */
const CATEGORY_TAGS: Record<ErrorCategory, Record<string, string>> = {
  AUTH: {
    domain: 'authentication',
    priority: 'high',
    team: 'security',
    alerting: 'immediate',
  },
  VALIDATION: {
    domain: 'user-input',
    priority: 'medium',
    team: 'frontend',
    alerting: 'batch',
  },
  DB: {
    domain: 'database',
    priority: 'critical',
    team: 'backend',
    alerting: 'immediate',
  },
  BIZ: {
    domain: 'business-logic',
    priority: 'medium',
    team: 'product',
    alerting: 'daily',
  },
  EXTERNAL: {
    domain: 'third-party',
    priority: 'medium',
    team: 'integration',
    alerting: 'hourly',
  },
  SYSTEM: {
    domain: 'infrastructure',
    priority: 'critical',
    team: 'devops',
    alerting: 'immediate',
  },
  RATE: {
    domain: 'rate-limiting',
    priority: 'low',
    team: 'backend',
    alerting: 'daily',
  },
};

/**
 * 重要度をSentryのレベルにマッピング
 */
function mapSeverityToSentryLevel(severity: SeverityLevel): Sentry.SeverityLevel {
  switch (severity) {
    case 'critical':
      return 'fatal';
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
      return 'info';
    default:
      return 'error';
  }
}

/**
 * エラーのフィンガープリントを生成
 */
function generateFingerprint(error: AppError): string[] {
  return ['dayopt', error.category, error.code.toString()];
}

/**
 * AppErrorをSentryに報告
 *
 * @example
 * ```typescript
 * import { reportToSentry } from '@/platform/sentry'
 * import { AppError } from '@/config/error-patterns'
 *
 * try {
 *   await riskyOperation()
 * } catch (error) {
 *   const appError = new AppError('操作に失敗', 'SYSTEM_ERROR_500', { error })
 *   reportToSentry(appError)
 * }
 * ```
 */
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

export function reportToSentry(
  error: AppError,
  userContext?: { userId?: string; ip?: string; userAgent?: string },
): void {
  Sentry.withScope((scope) => {
    // エラーコード・カテゴリ・重要度をタグ付け
    scope.setTag('errorCode', error.code);
    scope.setTag('errorCategory', error.category);
    scope.setTag('severity', error.severity);

    // カテゴリ別タグを追加
    const categoryTags = CATEGORY_TAGS[error.category];
    Object.entries(categoryTags).forEach(([key, value]) => {
      scope.setTag(key, value);
    });

    // フィンガープリントとレベル設定
    scope.setFingerprint(generateFingerprint(error));
    scope.setLevel(mapSeverityToSentryLevel(error.severity));

    // エラーパターン情報をコンテキストに追加
    scope.setContext('errorPattern', {
      code: error.code,
      category: error.category,
      severity: error.severity,
      userMessage: error.userMessage,
    });

    // メタデータがあればPII除外してコンテキストに追加
    if (error.metadata) {
      scope.setContext('errorMetadata', sanitizeMetadata(error.metadata));
    }

    // ユーザーコンテキストを設定
    if (userContext?.userId) {
      scope.setUser({
        id: userContext.userId,
        ...(userContext.ip && { ip_address: userContext.ip }),
      });
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
  static handleError(error: Error | AppError, context?: Record<string, unknown>): void {
    if (error instanceof AppError) {
      reportToSentry(error);
    } else {
      // 通常のErrorをAppErrorに変換してレポート
      const appError = new AppError(error.message, 'SYSTEM_ERROR_500', {
        originalError: error,
        ...context,
      });
      reportToSentry(appError);
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
