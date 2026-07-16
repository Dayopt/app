/**
 * アプリケーションロガー
 *
 * - error / warn: 全環境で出力（本番でのエラー検知に必須）+ Sentry breadcrumb
 * - log / info / debug: 開発環境のみ出力
 */

import * as Sentry from '@sentry/nextjs';

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * breadcrumb には安定したログ名だけを残す。
 *
 * structured args を stringify すると、field 名を失った短い認証コードや検索語が
 * beforeBreadcrumb の path-aware scrubber をすり抜けるため送信しない。
 */
function toBreadcrumbMessage(args: unknown[]): string {
  return (args.find((arg): arg is string => typeof arg === 'string') ?? '[structured log]').slice(
    0,
    200,
  );
}

/** アプリケーション統一ロガー（error/warnはSentry breadcrumbも記録） */
export const logger = {
  log: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  error: (...args: unknown[]) => {
    console.error(...args);
    Sentry.addBreadcrumb({
      message: toBreadcrumbMessage(args),
      category: 'logger',
      level: 'error',
    });
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
    Sentry.addBreadcrumb({
      message: toBreadcrumbMessage(args),
      category: 'logger',
      level: 'warning',
    });
  },
  info: (...args: unknown[]) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },
  debug: (...args: unknown[]) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  },
} as const;
