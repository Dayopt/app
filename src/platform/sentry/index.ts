/**
 * Sentry統合システム - エクスポートモジュール
 *
 * Sentryの初期化は instrumentation.ts / instrumentation-client.ts で行われます。
 * このモジュールはヘルパー関数のみを提供します。
 */

// メイン統合機能
export {
  SentryErrorHandler,
  addUserActionBreadcrumb,
  captureBusinessEvent,
  handleApiError,
  handleReactError,
  isSentryInitialized,
  reportToSentry,
  setUserPlanTag,
} from './integration';

// パフォーマンストレースヘルパー
export { traceApiCall, traceDbQuery, traceServerComponent, withTrace } from './trace';
