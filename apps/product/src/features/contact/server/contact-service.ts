import 'server-only';

/**
 * Contact Service
 *
 * お問い合わせ内容を GitHub Issue として作成するサービス層
 * Issue フォーマットは Web側（dayopt.app/contact）と統一しつつ、
 * App側は環境情報・プラン情報を自動付与
 */

import { z } from 'zod';

import { env } from '@/env';
import { logger } from '@/lib/logger';
import { captureUnexpectedError } from '@/lib/sentry';
import { ServiceError } from '@/lib/trpc/errors';

import type { ContactFormInput } from '../types';

const GITHUB_TOKEN = env.GITHUB_TOKEN;
/** Web側と同じ変数名。アクセス制限したprivate repositoryのみ許可する。 */
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

const githubIssueResponseSchema = z.object({
  html_url: z.string().url(),
  number: z.number().int().positive(),
});
const githubRepositoryResponseSchema = z.object({ private: z.boolean() });
const githubRepositoryNameSchema = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u);

async function requirePrivateGitHubRepository(
  repository: string,
  token: string,
  signal: AbortSignal,
): Promise<string> {
  const parsedRepository = githubRepositoryNameSchema.safeParse(repository);
  if (!parsedRepository.success) {
    throw new ServiceError('GITHUB_API_FAILED', 'GitHub contact repository is invalid');
  }

  const [owner, name] = parsedRepository.data.split('/');
  if (!owner || !name) {
    throw new ServiceError('GITHUB_API_FAILED', 'GitHub contact repository is invalid');
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
    throw new ServiceError(
      'GITHUB_API_FAILED',
      'GitHub contact repository privacy could not be verified',
    );
  }

  const parsedResponse = githubRepositoryResponseSchema.safeParse(await response.json());
  if (!parsedResponse.success || !parsedResponse.data.private) {
    throw new ServiceError('GITHUB_API_FAILED', 'GitHub contact repository must be private');
  }
  return repositoryPath;
}

/** GitHub Issue 起票に成功した結果。失敗時は再送可能にするため例外を返す。 */
export type DeliverContactFeedbackResult = {
  delivered: true;
  issueUrl: string;
  issueNumber: number;
};

/**
 * GitHub Issue を作成する
 */
export async function createGitHubIssue(params: CreateIssueParams): Promise<CreateIssueResult> {
  if (!GITHUB_TOKEN || !GITHUB_CONTACT_REPO) {
    throw new ServiceError('GITHUB_API_FAILED', 'GitHub API configuration is missing');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GITHUB_API_TIMEOUT_MS);

  try {
    const repositoryPath = await requirePrivateGitHubRepository(
      GITHUB_CONTACT_REPO,
      GITHUB_TOKEN,
      controller.signal,
    );
    const { userId, userEmail, userName, input } = params;
    const categoryLabel = CATEGORY_LABELS[input.category] ?? input.category;
    const environment = input.environment;
    const issueBody = [
      `> via **Dayopt App**`,
      '',
      `**From:** ${userName} (${userEmail})`,
      `**User ID:** \`${userId}\``,
      `**Plan:** Free`,
      `**Category:** ${categoryLabel}`,
      '',
      '**Environment:**',
      `- App Version: ${environment.appVersion}`,
      `- OS: ${environment.os}`,
      `- Browser: ${environment.browser}`,
      `- Timezone: ${environment.timezone}`,
      `- Language: ${environment.language}`,
      '',
      '---',
      '',
      input.message,
    ].join('\n');

    const response = await fetch(`https://api.github.com/repos/${repositoryPath}/issues`, {
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
      throw new ServiceError('GITHUB_API_FAILED', `GitHub API error (${response.status})`);
    }

    const parsedResponse = githubIssueResponseSchema.safeParse(await response.json());
    if (!parsedResponse.success) {
      throw new ServiceError('GITHUB_API_FAILED', 'GitHub API returned an invalid response');
    }
    const data = parsedResponse.data;

    return {
      issueUrl: data.html_url,
      issueNumber: data.number,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * フィードバックを GitHub Issue として起票する。
 *
 * 失敗時はPIIを含まない技術情報だけをログとSentryへ送り、元のErrorを再throwする。
 * UIはダイアログと本文を保持し、ユーザーが再送できる状態にする。
 */
export async function deliverContactFeedback(
  params: CreateIssueParams,
): Promise<DeliverContactFeedbackResult> {
  try {
    const result = await createGitHubIssue(params);
    return { delivered: true, ...result };
  } catch (error) {
    const { userId, input } = params;
    const originalError =
      error instanceof Error ? error : new Error('Unknown contact delivery failure');

    logger.error('Contact feedback delivery to GitHub failed', {
      userId,
      category: input.category,
      errorType: originalError.name,
    });

    captureUnexpectedError(originalError, {
      feature: 'contact',
      source: 'contact',
      operation: 'github_issue_create',
      userId,
    });

    throw originalError;
  }
}
