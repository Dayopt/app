import 'server-only';

/**
 * Contact Service
 *
 * お問い合わせ内容を GitHub Issue として作成するサービス層
 * Issue フォーマットは Web側（dayopt.app/contact）と統一しつつ、
 * App側は環境情報・プラン情報を自動付与
 */

import * as Sentry from '@sentry/nextjs';

import { env } from '@/env';
import { logger } from '@/lib/logger';
import { ServiceError } from '@/lib/trpc/errors';

import type { ContactFormInput } from '../types';

const GITHUB_TOKEN = env.GITHUB_TOKEN;
/** Web側と同じ変数名 (e.g. "Dayopt/dayopt") */
const GITHUB_CONTACT_REPO = env.GITHUB_CONTACT_REPO;

/** GitHub API のタイムアウト（Web側 apps/web/src/app/api/contact/route.ts と同値） */
const GITHUB_API_TIMEOUT_MS = 10_000;

/** Web側と統一したカテゴリラベル */
const CATEGORY_LABELS: Record<string, string> = {
  bug: 'Bug',
  feature: 'Feature',
  question: 'Question',
  other: 'Other',
};

interface CreateIssueParams {
  userId: string;
  userEmail: string;
  userName: string;
  input: ContactFormInput;
}

interface CreateIssueResult {
  issueUrl: string;
  issueNumber: number;
}

/** GitHub Issue 起票の結果。失敗してもフィードバック自体は失われない */
export type DeliverContactFeedbackResult =
  { delivered: true; issueUrl: string; issueNumber: number } | { delivered: false };

/**
 * GitHub Issue を作成する
 */
export async function createGitHubIssue(params: CreateIssueParams): Promise<CreateIssueResult> {
  if (!GITHUB_TOKEN || !GITHUB_CONTACT_REPO) {
    throw new ServiceError('GITHUB_API_FAILED', 'GitHub API configuration is missing');
  }

  const { userId, userEmail, userName, input } = params;
  const categoryLabel = CATEGORY_LABELS[input.category] ?? input.category;
  const env = input.environment;

  const issueBody = [
    `> via **Dayopt App**`,
    '',
    `**From:** ${userName} (${userEmail})`,
    `**User ID:** \`${userId}\``,
    `**Plan:** Free`,
    `**Category:** ${categoryLabel}`,
    '',
    '**Environment:**',
    `- App Version: ${env.appVersion}`,
    `- OS: ${env.os}`,
    `- Browser: ${env.browser}`,
    `- Timezone: ${env.timezone}`,
    `- Language: ${env.language}`,
    '',
    '---',
    '',
    input.message,
  ].join('\n');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GITHUB_API_TIMEOUT_MS);

  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_CONTACT_REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        title: `[App] [${categoryLabel}] ${userName}`,
        body: issueBody,
        labels: ['contact', 'feedback', 'app', input.category],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new ServiceError(
        'GITHUB_API_FAILED',
        `GitHub API error (${response.status}): ${errorBody}`,
      );
    }

    const data = (await response.json()) as { html_url: string; number: number };

    return {
      issueUrl: data.html_url,
      issueNumber: data.number,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * フィードバックを GitHub Issue として起票する（best-effort）
 *
 * 初期ユーザーの声はこのプロダクトで最も回収不能な資産なので、起票に失敗しても
 * ユーザーの送信は失敗させない。内容を構造化ログと Sentry event に退避してから
 * `delivered: false` を返す（呼び出し元は成功として扱ってよい）。
 */
export async function deliverContactFeedback(
  params: CreateIssueParams,
): Promise<DeliverContactFeedbackResult> {
  try {
    const result = await createGitHubIssue(params);
    return { delivered: true, ...result };
  } catch (error) {
    const { userId, userEmail, input } = params;

    logger.error('Contact feedback delivery to GitHub failed', {
      userId,
      userEmail,
      category: input.category,
      message: input.message,
      environment: input.environment,
      error: error instanceof Error ? error.message : String(error),
    });

    // Sentry の extra は PII scrub（scrub-pii.ts）で email が redact されるため、
    // 送信者の特定は user.id 側で担保する
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { source: 'contact', operation: 'github_issue_create' },
      user: { id: userId },
      extra: {
        category: input.category,
        message: input.message,
        environment: input.environment,
      },
    });

    return { delivered: false };
  }
}
