import { NextRequest, NextResponse } from 'next/server';

import { logger } from '@/lib/logger';

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

    // 本番環境ではSentryやログサービスに送信
    // @see Issue #487 - Sentry統合は別途実装予定

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
