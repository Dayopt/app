import * as Sentry from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';

/** ブラウザ拡張機能由来のCSP違反はSentryに送信しない（クォータ節約） */
const IGNORED_URI_PREFIXES = ['chrome-extension://', 'moz-extension://', 'safari-extension://'];

/**
 * CSP（Content Security Policy）違反レポートエンドポイント
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
 * @see Issue #487 - OWASP準拠のセキュリティ強化
 */

interface CSPReport {
  'csp-report': {
    'document-uri': string;
    'violated-directive': string;
    'effective-directive': string;
    'original-policy': string;
    'blocked-uri': string;
    'status-code': number;
    'source-file'?: string;
    'line-number'?: number;
    'column-number'?: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const report: CSPReport = await request.json();
    const cspReport = report['csp-report'];

    // CSP違反ログ出力
    logger.warn('[CSP Violation]', {
      documentUri: cspReport['document-uri'],
      violatedDirective: cspReport['violated-directive'],
      blockedUri: cspReport['blocked-uri'],
      sourceFile: cspReport['source-file'],
      lineNumber: cspReport['line-number'],
      columnNumber: cspReport['column-number'],
    });

    // ブラウザ拡張機能由来の違反はSentryに送信しない
    const blockedUri = cspReport['blocked-uri'];
    const isExtensionViolation = IGNORED_URI_PREFIXES.some((prefix) =>
      blockedUri.startsWith(prefix),
    );

    if (!isExtensionViolation) {
      Sentry.captureMessage(`CSP Violation: ${cspReport['violated-directive']}`, {
        level: 'warning',
        tags: {
          type: 'csp-violation',
          directive: cspReport['violated-directive'],
          blockedUri,
        },
        contexts: {
          csp: {
            documentUri: cspReport['document-uri'],
            effectiveDirective: cspReport['effective-directive'],
            sourceFile: cspReport['source-file'],
            lineNumber: cspReport['line-number'],
          },
        },
      });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    logger.error('[CSP Report Error]', error);
    return NextResponse.json({ error: 'Invalid report' }, { status: 400 });
  }
}

// HEADリクエスト対応（一部ブラウザ用）
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
