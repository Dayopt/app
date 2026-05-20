import { verifyTurnstile } from '@/lib/turnstile';
import { apiError, apiSuccess, ErrorCode } from '@/platform/api/api-response';
import { env } from '@/platform/config/env';
import { verifyCsrfToken } from '@/platform/security/csrf-protection';
import { contactRateLimit, getClientIp } from '@/platform/security/rate-limit';
import { NextRequest } from 'next/server';
import { z } from 'zod';

const contactSchema = z.object({
  name: z.string().min(1).max(50),
  email: z.string().email(),
  category: z.string().min(1),
  message: z.string().min(10).max(1000),
  website: z.string().optional(),
  turnstileToken: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // CSRF トークン検証
    if (!verifyCsrfToken(request)) {
      return apiError('Invalid CSRF token', 403, {
        code: ErrorCode.CSRF_INVALID,
      });
    }

    // レート制限チェック
    const ip = getClientIp(request);
    const { success, limit, remaining, reset } = await contactRateLimit.limit(ip);

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

    const body = await request.json();
    const data = contactSchema.parse(body);

    // Honeypot: bot が hidden フィールドに値を入れた場合、静かに成功を返す
    if (data.website) {
      return apiSuccess({ success: true });
    }

    // Cloudflare Turnstile 検証
    const turnstileResult = await verifyTurnstile(data.turnstileToken, ip);
    if (!turnstileResult.success) {
      return apiError('Bot verification failed', 403, {
        code: ErrorCode.BOT_DETECTED,
        details: { errors: turnstileResult['error-codes'] },
      });
    }

    const githubToken = env.GITHUB_TOKEN;
    const githubRepo = env.GITHUB_CONTACT_REPO || 'Dayopt/dayopt';

    if (!githubToken) {
      return apiError('Server configuration error', 500, { code: ErrorCode.CONFIG_ERROR });
    }

    const categoryLabels: Record<string, string> = {
      bug: 'Bug',
      feature: 'Feature',
      question: 'Question',
      other: 'Other',
    };

    const categoryLabel = categoryLabels[data.category] || data.category;

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

    // タイムアウト設定（10秒）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`https://api.github.com/repos/${githubRepo}/issues`, {
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

      clearTimeout(timeoutId);

      if (!response.ok) {
        return apiError('Failed to submit contact request', 500, {
          code: ErrorCode.EXTERNAL_SERVICE_ERROR,
        });
      }

      const issueData = await response.json();

      return apiSuccess({
        success: true,
        issueNumber: issueData.number,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return apiError('Request timeout. Please try again later.', 504, {
          code: ErrorCode.TIMEOUT,
        });
      }

      return apiError('Failed to submit contact request', 500, {
        code: ErrorCode.EXTERNAL_SERVICE_ERROR,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError('Validation failed', 400, {
        code: ErrorCode.VALIDATION_ERROR,
        details: error.issues,
      });
    }

    return apiError('Internal server error', 500, { code: ErrorCode.INTERNAL_ERROR });
  }
}
