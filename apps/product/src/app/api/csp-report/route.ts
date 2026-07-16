import { sanitizeObservabilityUrl } from '@dayopt/observability';
import * as Sentry from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { apiRateLimit, withUpstashRateLimit } from '@/lib/rate-limit/upstash';

const MAX_REPORT_BYTES = 16 * 1024;
const MAX_URI_LENGTH = 4096;
const MAX_POLICY_LENGTH = 12_000;

/** ブラウザ拡張機能由来のCSP違反はSentryに送信しない（クォータ節約） */
const IGNORED_URI_PREFIXES = ['chrome-extension://', 'moz-extension://', 'safari-extension://'];

const cspReportSchema = z.object({
  'csp-report': z
    .object({
      'document-uri': z.string().max(MAX_URI_LENGTH),
      'violated-directive': z.string().trim().min(1).max(256),
      'effective-directive': z.string().trim().max(256).optional().default(''),
      'original-policy': z.string().max(MAX_POLICY_LENGTH).optional().default(''),
      'blocked-uri': z.string().max(MAX_URI_LENGTH),
      'status-code': z.number().int().min(0).max(599).optional().default(0),
      'source-file': z.string().max(MAX_URI_LENGTH).optional(),
      'line-number': z.number().int().nonnegative().optional(),
      'column-number': z.number().int().nonnegative().optional(),
    })
    .passthrough(),
});

class ReportTooLargeError extends Error {}

/**
 * CSP（Content Security Policy）違反レポートエンドポイント
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
 * @see Issue #487 - OWASP準拠のセキュリティ強化
 */

export async function POST(request: NextRequest) {
  const rateLimitResponse = await checkRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const rawReport = await readJsonBody(request);
    const parseResult = cspReportSchema.safeParse(rawReport);

    if (!parseResult.success) {
      logger.warn('[CSP Report Rejected]', { reason: 'invalid_schema' });
      return NextResponse.json({ error: 'Invalid report' }, { status: 400 });
    }

    const cspReport = parseResult.data['csp-report'];
    const rawBlockedUri = cspReport['blocked-uri'];
    const documentUri = sanitizeReportUri(cspReport['document-uri']);
    const blockedUri = sanitizeReportUri(rawBlockedUri);
    const sourceFile = sanitizeReportUri(cspReport['source-file']);
    const directive = normalizeDirective(cspReport['violated-directive']);
    const effectiveDirective = normalizeDirective(cspReport['effective-directive']);

    logger.warn('[CSP Violation]', {
      documentUri,
      violatedDirective: directive,
      blockedUri,
      sourceFile,
      lineNumber: cspReport['line-number'],
      columnNumber: cspReport['column-number'],
    });

    const isExtensionViolation = IGNORED_URI_PREFIXES.some((prefix) =>
      rawBlockedUri.startsWith(prefix),
    );

    if (!isExtensionViolation) {
      Sentry.captureMessage(`CSP Violation: ${directive}`, {
        level: 'warning',
        fingerprint: ['csp-violation', directive],
        tags: {
          type: 'csp-violation',
          directive,
        },
        contexts: {
          csp: {
            documentUri,
            blockedUri,
            effectiveDirective,
            sourceFile,
            lineNumber: cspReport['line-number'],
          },
        },
      });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    if (error instanceof ReportTooLargeError) {
      logger.warn('[CSP Report Rejected]', { reason: 'body_too_large' });
      return NextResponse.json({ error: 'Report too large' }, { status: 413 });
    }

    logger.warn('[CSP Report Rejected]', { reason: 'invalid_json' });
    return NextResponse.json({ error: 'Invalid report' }, { status: 400 });
  }
}

async function checkRateLimit(request: NextRequest): Promise<NextResponse | null> {
  const result = await withUpstashRateLimit(request, apiRateLimit);
  if (!result) {
    logger.warn('[CSP Report Rejected]', { reason: 'rate_limit_unavailable' });
    return NextResponse.json(
      { error: 'Temporarily unavailable' },
      { status: 503, headers: { 'Retry-After': '60' } },
    );
  }
  if (result.success) return null;

  return NextResponse.json(
    { error: 'Too many reports' },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': result.reset.toString(),
        'Retry-After': Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)).toString(),
      },
    },
  );
}

async function readJsonBody(request: NextRequest): Promise<unknown> {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const declaredBytes = Number.parseInt(contentLength, 10);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_REPORT_BYTES) {
      throw new ReportTooLargeError();
    }
  }

  if (!request.body) return JSON.parse('') as unknown;

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let body = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_REPORT_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The size violation still takes precedence if the sender already closed the stream.
        }
        throw new ReportTooLargeError();
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  return JSON.parse(body) as unknown;
}

function normalizeDirective(value: string): string {
  const directive = value.trim().toLowerCase().split(/\s+/u)[0] ?? '';
  const safeDirective = directive.replace(/[^a-z0-9-]/gu, '').slice(0, 64);
  return safeDirective || 'unknown';
}

function sanitizeReportUri(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;

  const extensionPrefix = IGNORED_URI_PREFIXES.find((prefix) => value.startsWith(prefix));
  if (extensionPrefix) return `${extensionPrefix}[redacted]`;

  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return sanitizeObservabilityUrl(value).slice(0, MAX_URI_LENGTH);
    }
    return `${url.protocol}`;
  } catch {
    return sanitizeObservabilityUrl(value).slice(0, MAX_URI_LENGTH);
  }
}

// HEADリクエスト対応（一部ブラウザ用）
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
