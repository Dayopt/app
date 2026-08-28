import { verifyTurnstile } from '@web/lib/turnstile';
import { apiError, apiSuccess, ErrorCode } from '@web/platform/api/api-response';
import { captureUnexpectedWebError } from '@web/platform/observability/capture-unexpected-error';
import { resolveTechnicalRequestId } from '@web/platform/observability/technical-error-context';
import { verifyCsrfToken } from '@web/platform/security/csrf-protection';
import {
  contactGlobalRateLimit,
  contactRateLimit,
  getClientIp,
  hashRateLimitIdentifier,
} from '@web/platform/security/rate-limit';
import { NextRequest } from 'next/server';
import { z } from 'zod';

import { sendContactEmail } from './contact-email';

export const maxDuration = 30;

const MAX_CONTACT_BODY_BYTES = 16 * 1024;

/**
 * bot が正しく拒否された「正常系」の siteverify error-code（token / client 側の問題、および
 * このルート独自の action/hostname 検証）。このリストに一致しない失敗は
 * TURNSTILE_SECRET_KEY 自体の misconfiguration とみなし、Sentry へ alert する。
 *
 * denylist（'invalid-input-secret' だけを見る）ではなく allowlist にしている理由: PR #2122
 * クロスレビューで、denylist だと 'missing-input-secret'（secret が空文字で上書きされた
 * 場合。2026-08-17 の RECOVERY_CODE_PEPPER 空文字 incident #2115 と同型）のような他の
 * secret misconfiguration variant が同じ穴で握り潰されると指摘された。Cloudflare
 * siteverify を直接叩いて実測（`secret=''` → `missing-input-secret`）し、Cloudflare が
 * 将来追加する未知の error-code も含めて secret 側の異常を安全側（alert）に倒す設計にした。
 * 設計の詳細は 決定ログ（削除済み、git 履歴参照）。
 */
const EXPECTED_TURNSTILE_TOKEN_ISSUE_CODES: ReadonlySet<string> = new Set([
  'invalid-input-response',
  'missing-input-response',
  'timeout-or-duplicate',
  'action-mismatch', // apps/web/src/lib/turnstile/verify.ts が付与する独自コード
  'hostname-mismatch', // 同上
]);

class ContactBodyTooLargeError extends Error {
  constructor() {
    super('Contact request body is too large');
    this.name = 'ContactBodyTooLargeError';
  }
}

const contactSchema = z
  .object({
    submissionId: z.string().uuid(),
    name: z.string().trim().min(1).max(50),
    email: z
      .string()
      .trim()
      .max(254)
      .email()
      .refine((value) => !/[\r\n,]/u.test(value)),
    category: z.enum(['bug', 'feature', 'question', 'other']),
    message: z.string().min(10).max(1000),
    website: z.string().max(200).optional(),
    turnstileToken: z.string().max(4096).optional(),
  })
  .strict();

function captureContactFailure(error: unknown, operation: string, requestId?: string): Error {
  return captureUnexpectedWebError(error, {
    feature: 'contact',
    operation,
    route: '/api/contact',
    ...(requestId ? { requestId } : {}),
  });
}

async function readJsonBody(request: NextRequest): Promise<unknown> {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const declaredBytes = Number.parseInt(contentLength, 10);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_CONTACT_BODY_BYTES) {
      throw new ContactBodyTooLargeError();
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
      if (receivedBytes > MAX_CONTACT_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ContactBodyTooLargeError();
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  return JSON.parse(body) as unknown;
}

export async function POST(request: NextRequest) {
  const requestId = resolveTechnicalRequestId(request.headers);

  if (!verifyCsrfToken(request)) {
    return apiError('Invalid CSRF token', 403, { code: ErrorCode.CSRF_INVALID });
  }

  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    return apiError('Content-Type must be application/json', 415, {
      code: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
    });
  }

  const ip = getClientIp(request);
  let rateLimitResult: Awaited<ReturnType<typeof contactRateLimit.limit>>;
  try {
    rateLimitResult = await contactRateLimit.limit(await hashRateLimitIdentifier(ip));
  } catch (error) {
    captureContactFailure(error, 'rate_limit', requestId);
    return apiError('Temporarily unavailable', 503, {
      code: ErrorCode.EXTERNAL_SERVICE_ERROR,
    });
  }

  const { success, limit, remaining, reset } = rateLimitResult;
  if (!success) {
    return apiError('Too many requests. Please try again later.', 429, {
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
      details: { limit, remaining, reset: new Date(reset).toISOString() },
    });
  }

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    if (error instanceof ContactBodyTooLargeError) {
      return apiError('Request body too large', 413, { code: ErrorCode.PAYLOAD_TOO_LARGE });
    }
    if (error instanceof SyntaxError) {
      return apiError('Validation failed', 400, { code: ErrorCode.VALIDATION_ERROR });
    }
    captureContactFailure(error, 'parse_request', requestId);
    return apiError('Internal server error', 500, { code: ErrorCode.INTERNAL_ERROR });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('Validation failed', 400, {
      code: ErrorCode.VALIDATION_ERROR,
      details: parsed.error.issues,
    });
  }
  const data = parsed.data;

  // Honeypot bots receive a quiet success without consuming external services.
  if (data.website) return apiSuccess({ success: true });

  let turnstileResult: Awaited<ReturnType<typeof verifyTurnstile>>;
  try {
    turnstileResult = await verifyTurnstile(data.turnstileToken, ip);
  } catch (error) {
    captureContactFailure(error, 'verify_turnstile', requestId);
    return apiError('Bot verification service unavailable', 503, {
      code: ErrorCode.EXTERNAL_SERVICE_ERROR,
    });
  }
  if (!turnstileResult.success) {
    // 通常の bot 検出（token 不正・期限切れ等）は正常系なので Sentry へ送らないが、それ以外
    // （TURNSTILE_SECRET_KEY 自体の misconfiguration を含む）は区別して alert する。
    // allowlist にしている理由は EXPECTED_TURNSTILE_TOKEN_ISSUE_CODES のコメント参照。
    const errorCodes = turnstileResult['error-codes'] ?? [];
    const isKnownTokenIssue =
      errorCodes.length > 0 && errorCodes.every((c) => EXPECTED_TURNSTILE_TOKEN_ISSUE_CODES.has(c));
    if (!isKnownTokenIssue) {
      captureContactFailure(
        new Error(
          `Turnstile verification failed unexpectedly (error-codes: ${errorCodes.join(', ') || 'none'})`,
        ),
        'verify_turnstile_unexpected',
        requestId,
      );
    }
    return apiError('Bot verification failed', 403, { code: ErrorCode.BOT_DETECTED });
  }

  try {
    const globalResult = await contactGlobalRateLimit.limit('global');
    if (!globalResult.success) {
      return apiError('Too many requests. Please try again later.', 429, {
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
      });
    }
  } catch (error) {
    captureContactFailure(error, 'global_rate_limit', requestId);
    return apiError('Temporarily unavailable', 503, {
      code: ErrorCode.EXTERNAL_SERVICE_ERROR,
    });
  }

  try {
    await sendContactEmail({
      submissionId: data.submissionId,
      name: data.name,
      email: data.email,
      category: data.category,
      message: data.message,
    });
    return apiSuccess({ success: true });
  } catch (error) {
    captureContactFailure(error, 'send_contact_email', requestId);
    return apiError('Failed to submit contact request', 500, {
      code: ErrorCode.EXTERNAL_SERVICE_ERROR,
    });
  }
}
