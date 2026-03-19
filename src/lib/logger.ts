/**
 * アプリケーションロガー
 *
 * - error / warn: 全環境で出力（本番でのエラー検知に必須）+ Sentry breadcrumb
 * - log / info / debug: 開発環境のみ出力
 */

import * as Sentry from '@sentry/nextjs';

const isDevelopment = process.env.NODE_ENV === 'development';

/** ログ引数を200文字以内の文字列に変換（breadcrumb用） */
function toBreadcrumbMessage(args: unknown[]): string {
  return args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')
    .slice(0, 200);
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
