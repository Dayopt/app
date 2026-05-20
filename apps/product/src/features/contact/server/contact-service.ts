import 'server-only';

/**
 * Contact Service
 *
 * お問い合わせ内容を GitHub Issue として作成するサービス層
 * Issue フォーマットは Web側（dayopt.app/contact）と統一しつつ、
 * App側は環境情報・プラン情報を自動付与
 */

import { env } from '@/env';
import { ServiceError } from '@/lib/trpc/errors';

import type { ContactFormInput } from '../types';

const GITHUB_TOKEN = env.GITHUB_TOKEN;
/** Web側と同じ変数名 (e.g. "Dayopt/dayopt") */
const GITHUB_CONTACT_REPO = env.GITHUB_CONTACT_REPO;

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
      labels: ['contact', 'app', input.category],
    }),
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
}
