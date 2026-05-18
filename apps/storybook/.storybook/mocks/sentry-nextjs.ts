/**
 * Storybook用 @sentry/nextjs モック
 *
 * @sentry/nextjs は Next.js 内部モジュール（process 依存）を要求するため、
 * Storybook の Vite 環境ではロードできない。使用される API を no-op で代替。
 */

const noop = () => {};

const noopScope = {
  setTag: noop,
  setExtra: noop,
  setFingerprint: noop,
  setLevel: noop,
  setContext: noop,
};

// --- Core APIs ---
export function captureException() {}
export function captureMessage() {}
export function addBreadcrumb() {}
export function setContext() {}
export function setTag() {}
export function setExtra() {}
export function setUser() {}
export function setMeasurement() {}

export function withScope(callback: (scope: typeof noopScope) => void) {
  callback(noopScope);
}

export function startSpan<T>(_options: unknown, callback: () => T): T {
  return callback();
}

export function getClient() {
  return undefined;
}

// --- Types (re-exported as values for runtime compatibility) ---
export type SeverityLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';
