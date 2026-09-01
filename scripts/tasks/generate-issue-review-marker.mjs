#!/usr/bin/env node

/**
 * `[codex-issue-review]` marker 生成スクリプト（#2530）。
 *
 * `pnpm review:marker`（PR 側 `[internal-review]`）と同じ設計思想:
 * - **識別子は実測する**。fingerprint は本 script が現在の Issue 内容から計算し、
 *   `--fingerprint` の受け口は用意しない（手入力 = 捏造経路を残さない）
 * - **出力は stdout のみ**。投稿（`gh issue comment`）はしない。目視確認の 1 拍を残す
 * - **書式は生成側で機械的に満たす**（zerolike / status 導出 / resolution 必須）
 *
 * さらに Issue 特有の 2 つの前提を生成時に検査する:
 * 1. Codex bot（`chatgpt-codex-connector`）のコメントが実在すること
 *    — レビューが実際に行われた証明。marker だけでは member の自己申告になる
 * 2. **最新の Codex コメントより後に Issue 本文が編集されていないこと**
 *    — 「レビュー後に本文を書き換え、その本文の fingerprint で marker を発行する」
 *      という順序の逆転を防ぐ。fingerprint 一致だけでは、この順序は検出できない
 *
 * Usage:
 *   pnpm review:issue:marker 2530 --p1 0 --p2 0
 *   pnpm review:issue:marker 2530 --p1 1 --p1-note "コメント参照" --p2 0 \
 *     --resolution-note "本文を修正し再レビュー済み"
 */

import { execFileSync } from 'node:child_process';

import { isDirectExecution } from '../lib/is-direct-execution.mjs';
import {
  CODEX_BOT_LOGIN,
  buildIssueReviewMarkerBody,
  computeIssueFingerprintFromIssue,
  isCodexBotLogin,
} from '../lib/issue-review-core.mjs';

const DEFAULT_REPO = 'Dayopt/dayopt';
const GH_MAX_BUFFER_BYTES = 32 * 1024 * 1024;
const COMMENT_WINDOW = 100;

const ISSUE_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      number
      title
      body
      createdAt
      lastEditedAt
      labels(first: 100) { nodes { name } }
      comments(last: ${COMMENT_WINDOW}) {
        nodes { createdAt url author { login } }
      }
    }
  }
}`;

/**
 * @typedef {(file: string, args: string[], options?: object) => string} ExecFileImpl
 */

/**
 * @param {{issueNumber: number, repo: string, execFileImpl?: ExecFileImpl}} input
 */
export function fetchIssueForMarker({ issueNumber, repo, execFileImpl = execFileSync }) {
  const [owner, name] = repo.split('/');
  if (!owner || !name) {
    throw new Error(`--repo は owner/name 形式で指定してください: ${repo}`);
  }

  const raw = execFileImpl(
    'gh',
    [
      'api',
      'graphql',
      '-f',
      `query=${ISSUE_QUERY}`,
      '-f',
      `owner=${owner}`,
      '-f',
      `name=${name}`,
      '-F',
      `number=${issueNumber}`,
    ],
    { encoding: 'utf8', maxBuffer: GH_MAX_BUFFER_BYTES },
  );

  const issue = JSON.parse(raw)?.data?.repository?.issue;
  if (!issue) {
    throw new Error(`issue #${issueNumber} を取得できませんでした。`);
  }
  return issue;
}

/**
 * 直近の Codex bot コメントを返す。無ければ null。
 * @param {{nodes?: Array<{createdAt?: string, url?: string, author?: {login?: string}}>}} comments
 */
export function findLatestCodexComment(comments) {
  const botComments = (comments?.nodes ?? []).filter((c) => isCodexBotLogin(c?.author?.login));
  if (botComments.length === 0) return null;
  return botComments.reduce((latest, c) =>
    new Date(c.createdAt ?? 0) >= new Date(latest.createdAt ?? 0) ? c : latest,
  );
}

/**
 * Issue 本文が最新の Codex レビューより後に編集されていないかを検査する。
 * 編集されていれば「レビュー対象と現在の本文が違う」ため marker を出さない。
 *
 * @param {{lastEditedAt?: string|null}} issue
 * @param {{createdAt?: string}} codexComment
 */
export function assertBodyNotEditedAfterReview(issue, codexComment) {
  if (!issue?.lastEditedAt) return;
  const editedAt = new Date(issue.lastEditedAt).getTime();
  const reviewedAt = new Date(codexComment?.createdAt ?? 0).getTime();
  if (Number.isNaN(editedAt) || Number.isNaN(reviewedAt)) {
    throw new Error(
      'Issue の編集時刻または Codex コメントの時刻を解釈できませんでした（fail closed）。',
    );
  }
  if (editedAt > reviewedAt) {
    throw new Error(
      `Issue 本文が最新の Codex レビュー（${codexComment.createdAt}）より後に編集されています（${issue.lastEditedAt}）。` +
        '現在の本文はまだレビューされていません。@codex へ再レビューを依頼してから marker を生成してください。',
    );
  }
}

function parseArgs(argv) {
  const flags = new Map();
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`--${key} には値が必要です。`);
      }
      flags.set(key, value);
      i += 1;
    } else {
      positional.push(arg);
    }
  }

  // fingerprint / reviewed-comment は実測値のみを使う契約。手入力の口は塞ぐ。
  for (const forbidden of ['fingerprint', 'reviewed-comment', 'status']) {
    if (flags.has(forbidden)) {
      throw new Error(
        `--${forbidden} は引数で受け付けません。現在の Issue 内容から実測した値のみを使います（捏造防止）。`,
      );
    }
  }

  const issueRaw = positional[0] ?? flags.get('issue');
  if (!issueRaw || !/^\d+$/.test(issueRaw)) {
    throw new Error(
      'issue 番号を第一引数で指定してください（例: pnpm review:issue:marker 2530）。',
    );
  }

  const p1Raw = flags.get('p1') ?? '0';
  const p2Raw = flags.get('p2') ?? '0';
  if (!/^\d+$/.test(p1Raw) || !/^\d+$/.test(p2Raw)) {
    throw new Error('--p1 / --p2 は 0 以上の整数で指定してください。');
  }

  return {
    issueNumber: Number(issueRaw),
    repo: flags.get('repo') ?? DEFAULT_REPO,
    p1Count: Number(p1Raw),
    p1Note: flags.get('p1-note'),
    p2Count: Number(p2Raw),
    p2Note: flags.get('p2-note'),
    p3: flags.get('p3'),
    resolutionNote: flags.get('resolution-note'),
  };
}

export function generateIssueReviewMarker(args, { execFileImpl = execFileSync } = {}) {
  const issue = fetchIssueForMarker({
    issueNumber: args.issueNumber,
    repo: args.repo,
    execFileImpl,
  });

  const codexComment = findLatestCodexComment(issue.comments);
  if (!codexComment) {
    throw new Error(
      `issue #${args.issueNumber} に Codex（${CODEX_BOT_LOGIN}）のレビューコメントがありません。` +
        '「@codex このIssueを実装前レビューしてください。…」を投稿し、返信を待ってから再実行してください。',
    );
  }

  assertBodyNotEditedAfterReview(issue, codexComment);

  const fingerprint = computeIssueFingerprintFromIssue({
    title: issue.title,
    body: issue.body,
    labels: (issue.labels?.nodes ?? []).map((n) => n?.name).filter(Boolean),
  });

  return buildIssueReviewMarkerBody({
    issueNumber: args.issueNumber,
    fingerprint,
    reviewedCommentUrl: codexComment.url,
    p1Count: args.p1Count,
    p1Note: args.p1Note,
    p2Count: args.p2Count,
    p2Note: args.p2Note,
    p3: args.p3,
    resolutionNote: args.resolutionNote,
  });
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    process.stdout.write(`${generateIssueReviewMarker(args)}\n`);
  } catch (err) {
    process.stderr.write(`❌ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

if (isDirectExecution(import.meta.url)) {
  main();
}
