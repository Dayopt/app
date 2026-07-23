import { dayoptUrls } from '@dayopt/config';
import { sanitizeObservabilityUrl } from '@dayopt/observability';
import * as Sentry from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  cspReportGlobalRateLimit,
  cspReportRateLimit,
  getClientIp,
  hashRateLimitIdentifier,
} from '@web/platform/security/rate-limit';

const MAX_REPORT_BYTES = 16 * 1024;
const MAX_URI_LENGTH = 4096;
const MAX_POLICY_LENGTH = 12_000;
const IGNORED_URI_PREFIXES = ['chrome-extension://', 'moz-extension://', 'safari-extension://'];
const CSP_REPORT_CONTENT_TYPE = 'application/csp-report';
const TRUSTED_DOCUMENT_ORIGIN = new URL(dayoptUrls.marketing).origin;
const VERCEL_TOOLBAR_ORIGIN = 'https://vercel.live';
const VERCEL_TOOLBAR_FONT_PATHS = new Set(['/geist.woff2', '/geist_mono.woff2']);
const KNOWN_CSP_DIRECTIVES = new Set([
  'base-uri',
  'child-src',
  'connect-src',
  'default-src',
  'font-src',
  'form-action',
  'frame-ancestors',
  'frame-src',
  'img-src',
  'manifest-src',
  'media-src',
  'object-src',
  'prefetch-src',
  'report-uri',
  'require-trusted-types-for',
  'script-src',
  'script-src-attr',
  'script-src-elem',
  'style-src',
  'style-src-attr',
  'style-src-elem',
  'trusted-types',
  'upgrade-insecure-requests',
  'worker-src',
]);

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

export async function POST(request: NextRequest) {
  if (!hasCspReportContentType(request.headers.get('content-type'))) {
    return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 });
  }

  const rateLimitResponse = await checkRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const rawReport = await readJsonBody(request);
    const parseResult = cspReportSchema.safeParse(rawReport);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid report' }, { status: 400 });
    }

    const report = parseResult.data['csp-report'];
    if (!hasTrustedDocumentOrigin(report['document-uri'])) {
      return NextResponse.json({ error: 'Invalid report origin' }, { status: 400 });
    }
    const rawBlockedUri = report['blocked-uri'];
    const directive = normalizeDirective(report['violated-directive']);
    const documentUri = sanitizeReportUri(report['document-uri']);
    const blockedUri = sanitizeReportUri(rawBlockedUri);
    const effectiveDirective = normalizeDirective(report['effective-directive']);
    const sourceFile = sanitizeReportUri(report['source-file']);
    const isExtensionViolation = IGNORED_URI_PREFIXES.some((prefix) =>
      rawBlockedUri.startsWith(prefix),
    );
    const isVercelToolbarFontViolation =
      directive === 'font-src' &&
      isVercelToolbarFont(rawBlockedUri) &&
      (report['source-file'] === undefined ||
        hasOrigin(report['source-file'], VERCEL_TOOLBAR_ORIGIN));

    if (!isExtensionViolation && !isVercelToolbarFontViolation) {
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
            lineNumber: report['line-number'],
          },
        },
      });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    if (error instanceof ReportTooLargeError) {
      return NextResponse.json({ error: 'Report too large' }, { status: 413 });
    }
    return NextResponse.json({ error: 'Invalid report' }, { status: 400 });
  }
}

async function checkRateLimit(request: NextRequest): Promise<NextResponse | null> {
  try {
    const identifier = await hashRateLimitIdentifier(getClientIp(request));
    const clientResult = await cspReportRateLimit.limit(identifier);
    if (!clientResult.success) return rateLimitedResponse(clientResult);

    const globalResult = await cspReportGlobalRateLimit.limit('all-clients');
    if (!globalResult.success) return rateLimitedResponse(globalResult);

    return null;
  } catch {
    return NextResponse.json(
      { error: 'Temporarily unavailable' },
      { status: 503, headers: { 'Retry-After': '60' } },
    );
  }
}

function rateLimitedResponse(result: {
  limit: number;
  remaining: number;
  reset: number;
}): NextResponse {
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
  return KNOWN_CSP_DIRECTIVES.has(safeDirective) ? safeDirective : 'unknown';
}

function hasCspReportContentType(value: string | null): boolean {
  return value?.split(';', 1)[0]?.trim().toLowerCase() === CSP_REPORT_CONTENT_TYPE;
}

function hasTrustedDocumentOrigin(value: string): boolean {
  return hasOrigin(value, TRUSTED_DOCUMENT_ORIGIN);
}

function hasOrigin(value: string | undefined, expectedOrigin: string): boolean {
  if (value === undefined) return false;

  try {
    return new URL(value).origin === expectedOrigin;
  } catch {
    return false;
  }
}

function isVercelToolbarFont(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === VERCEL_TOOLBAR_ORIGIN && VERCEL_TOOLBAR_FONT_PATHS.has(url.pathname);
  } catch {
    return false;
  }
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

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
