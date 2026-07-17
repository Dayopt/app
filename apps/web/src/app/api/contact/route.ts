import { verifyTurnstile } from '@/lib/turnstile';
import { apiError, apiSuccess, ErrorCode } from '@/platform/api/api-response';
import { env } from '@/platform/config/env';
import { captureUnexpectedWebError } from '@/platform/observability/capture-unexpected-error';
import { resolveTechnicalRequestId } from '@/platform/observability/technical-error-context';
import { verifyCsrfToken } from '@/platform/security/csrf-protection';
import {
  contactRateLimit,
  getClientIp,
  hashRateLimitIdentifier,
} from '@/platform/security/rate-limit';
import { NextRequest } from 'next/server';
import { z } from 'zod';

const contactSchema = z.object({
  name: z.string().min(1).max(50),
  email: z.string().email(),
  category: z.enum(['bug', 'feature', 'question', 'other']),
  message: z.string().min(10).max(1000),
  website: z.string().optional(),
  turnstileToken: z.string().optional(),
});

const githubIssueResponseSchema = z.object({ number: z.number().int().positive() });
const githubRepositoryResponseSchema = z.object({ private: z.boolean() });
const githubRepositoryNameSchema = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u);

function captureContactFailure(error: unknown, operation: string, requestId?: string): Error {
  return captureUnexpectedWebError(error, {
    feature: 'contact',
    operation,
    route: '/api/contact',
    ...(requestId ? { requestId } : {}),
  });
}

async function requirePrivateGitHubRepository(
  repository: string,
  token: string,
  signal: AbortSignal,
): Promise<string> {
  const parsedRepository = githubRepositoryNameSchema.safeParse(repository);
  if (!parsedRepository.success) {
    throw new Error('GitHub contact repository configuration is invalid');
  }

  const [owner, name] = parsedRepository.data.split('/');
  if (!owner || !name) {
    throw new Error('GitHub contact repository configuration is invalid');
  }
  const repositoryPath = `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const response = await fetch(`https://api.github.com/repos/${repositoryPath}`, {
    method: 'GET',
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
    },
    signal,
  });
  if (!response.ok) {
    throw new Error('GitHub contact repository privacy could not be verified');
  }

  const repositoryResult = githubRepositoryResponseSchema.safeParse(await response.json());
  if (!repositoryResult.success || !repositoryResult.data.private) {
    throw new Error('GitHub contact repository must be private');
  }
  return repositoryPath;
}

export async function POST(request: NextRequest) {
  const requestId = resolveTechnicalRequestId(request.headers);

  // CSRF トークン検証
  if (!verifyCsrfToken(request)) {
    return apiError('Invalid CSRF token', 403, {
      code: ErrorCode.CSRF_INVALID,
    });
  }

  const ip = getClientIp(request);
  let rateLimitResult: Awaited<ReturnType<typeof contactRateLimit.limit>>;
  try {
    rateLimitResult = await contactRateLimit.limit(await hashRateLimitIdentifier(ip));
  } catch (error) {
    captureContactFailure(error, 'rate_limit', requestId);
    return apiError('Temporarily unavailable', 503, { code: ErrorCode.EXTERNAL_SERVICE_ERROR });
  }

  const { success, limit, remaining, reset } = rateLimitResult;
  if (!success) {
    return apiError('Too many requests. Please try again later.', 429, {
      code: ErrorCode.RATE_LIMIT_EXCEEDED,
      details: {
        limit,
        remaining,
        reset: new Date(reset).toISOString(),
      },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
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

  // Honeypot: bot が hidden フィールドに値を入れた場合、静かに成功を返す
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
    return apiError('Bot verification failed', 403, {
      code: ErrorCode.BOT_DETECTED,
      details: { errors: turnstileResult['error-codes'] },
    });
  }

  const githubToken = env.GITHUB_TOKEN;
  const githubRepo = env.GITHUB_CONTACT_REPO;
  if (!githubToken || !githubRepo) {
    captureContactFailure(
      new Error('GitHub contact repository configuration is missing'),
      'configuration',
      requestId,
    );
    return apiError('Server configuration error', 500, { code: ErrorCode.CONFIG_ERROR });
  }

  const categoryLabels = {
    bug: 'Bug',
    feature: 'Feature',
    question: 'Question',
    other: 'Other',
  } as const;
  const categoryLabel = categoryLabels[data.category];
  const issueTitle = `[${categoryLabel}] ${data.name}`;
  const issueBody = [
    `**Category:** ${categoryLabel}`,
    `**From:** ${data.name}`,
    `**Email:** ${data.email}`,
    '',
    '---',
    '',
    data.message,
  ].join('\n');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  let githubOperation = 'verify_github_repository';
  try {
    const repositoryPath = await requirePrivateGitHubRepository(
      githubRepo,
      githubToken,
      controller.signal,
    );
    githubOperation = 'create_github_issue';
    const response = await fetch(`https://api.github.com/repos/${repositoryPath}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `token ${githubToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        title: issueTitle,
        body: issueBody,
        labels: ['contact', data.category],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = new Error('GitHub contact API returned an unsuccessful response');
      captureContactFailure(error, 'create_github_issue', requestId);
      return apiError('Failed to submit contact request', 500, {
        code: ErrorCode.EXTERNAL_SERVICE_ERROR,
      });
    }

    const issueResult = githubIssueResponseSchema.safeParse(await response.json());
    if (!issueResult.success) {
      captureContactFailure(
        new Error('GitHub contact API returned an invalid response'),
        'parse_github_response',
        requestId,
      );
      return apiError('Failed to submit contact request', 500, {
        code: ErrorCode.EXTERNAL_SERVICE_ERROR,
      });
    }

    return apiSuccess({ success: true, issueNumber: issueResult.data.number });
  } catch (error) {
    captureContactFailure(error, githubOperation, requestId);
    if (error instanceof Error && error.name === 'AbortError') {
      return apiError('Request timeout. Please try again later.', 504, {
        code: ErrorCode.TIMEOUT,
      });
    }
    return apiError('Failed to submit contact request', 500, {
      code: ErrorCode.EXTERNAL_SERVICE_ERROR,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
