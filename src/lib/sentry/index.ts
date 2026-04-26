/**
 * Sentry統合システム - エクスポートモジュール
 *
 * Sentryの初期化は instrumentation.ts / instrumentation-client.ts で行われます。
 * このモジュールはヘルパー関数のみを提供します。
 */

// メイン統合機能（実利用 API のみ）
export { SentryErrorHandler, captureBusinessEvent, handleReactError } from './integration';
