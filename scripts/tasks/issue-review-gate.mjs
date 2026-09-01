#!/usr/bin/env node

/**
 * Issue Review Gate — `review:full` Issue は実装前に Codex Issue Review を
 * 済ませたことを機械判定する（#2530）。
 *
 * 呼ばれる場所は 2 つ:
 * - **着手時**: `dispatch` skill 操作A が `pnpm review:issue:gate <N>` を実行し、
 *   pass しない `review:full` Issue を `status:in-progress` へ進めない
 * - **merge 時**: `scripts/tasks/finish-branch.sh` が linked `review:full` Issue
 *   ごとに本 script を呼び、実装中の本文編集で stale 化した review を検出する
 *
 * 判定は `scripts/lib/issue-review-core.mjs`（正本）へ委譲する。canonical 化と
 * fingerprint の計算式を bash / jq 側へ複製しないための構成で、
 * `protected-path-gate.mjs` と同じ「node へ委譲する単一実装」パターン。
 *
 * Usage:
 *   node scripts/tasks/issue-review-gate.mjs --issue 2530 [--repo Dayopt/dayopt]
 *   pnpm review:issue:gate 2530
 *
 * Output: stdout へ `{"required":false,"ok":true}` /
 * `{"required":true,"ok":true,"fingerprint":"…"}` の 1 行。停止理由は stderr。
 *
 * exit code: 0 = 実装/merge 可、1 = 停止（証跡なし / stale / 取得失敗）。
 * **取得失敗は必ず 1**（fail closed）。「確認できなかったから通す」経路は作らない。
 */

import { execFileSync } from 'node:child_process';

import { isDirectExecution } from '../lib/is-direct-execution.mjs';
import {
  CODEX_BOT_LOGIN,
  REVIEW_RELEVANT_LABEL,
  computeIssueFingerprintFromIssue,
  hasAnyIssueReviewEvidence,
  validateIssueReviewEvidence,
} from '../lib/issue-review-core.mjs';

const DEFAULT_REPO = 'Dayopt/dayopt';
const GH_MAX_BUFFER_BYTES = 32 * 1024 * 1024;

/** コメント取得の窓。窓外に落ちた証跡は「無い」と扱い、その旨を停止時に伝える。 */
export const COMMENT_WINDOW = 100;

const ISSUE_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issue(number: $number) {
      number
      title
      body
      labels(first: 100) { nodes { name } }
      comments(last: ${COMMENT_WINDOW}) {
        totalCount
        nodes { authorAssociation author { login } body createdAt }
      }
    }
  }
}`;

/**
 * @typedef {(file: string, args: string[], options?: object) => string} ExecFileImpl
 */

/** @param {string[]} args @param {{execFileImpl?: ExecFileImpl}} [opts] */
function runGh(args, { execFileImpl = execFileSync } = {}) {
  return execFileImpl('gh', args, { encoding: 'utf8', maxBuffer: GH_MAX_BUFFER_BYTES });
}

/**
 * Issue の title / body / labels / comments を 1 回の GraphQL で取得する。
 * 取得できない・形が想定外なら throw する（呼び出し側が fail closed で受ける）。
 *
 * @param {{issueNumber: number, repo: string, execFileImpl?: ExecFileImpl}} input
 */
export function fetchIssue({ issueNumber, repo, execFileImpl }) {
  const [owner, name] = repo.split('/');
  if (!owner || !name) {
    throw new Error(`--repo は owner/name 形式で指定してください: ${repo}`);
  }

  let raw;
  try {
    raw = runGh(
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
      { execFileImpl },
    );
  } catch (err) {
    throw new Error(`gh api graphql に失敗しました: ${String(err)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`gh の応答を JSON として解釈できませんでした: ${String(err)}`);
  }

  const issue = parsed?.data?.repository?.issue;
  if (!issue) {
    throw new Error(`issue #${issueNumber} を取得できませんでした（応答に issue がありません）。`);
  }

  return {
    number: issue.number,
    title: issue.title ?? '',
    body: issue.body ?? '',
    labels: (issue.labels?.nodes ?? []).map((n) => n?.name).filter(Boolean),
    comments: issue.comments?.nodes ?? [],
    commentsTotalCount: issue.comments?.totalCount ?? 0,
  };
}

/**
 * gate 判定本体。
 *
 * @param {{issueNumber: number, repo?: string, execFileImpl?: ExecFileImpl}} input
 * @returns {{required: boolean, ok: boolean, requiredBy?: string, fingerprint?: string, reason?: string, truncated?: boolean, steps?: Record<string, number>}}
 */
export function runIssueReviewGate({ issueNumber, repo = DEFAULT_REPO, execFileImpl }) {
  const issue = fetchIssue({ issueNumber, repo, execFileImpl });

  const hasLabel = issue.labels.includes(REVIEW_RELEVANT_LABEL);
  // ラベルが外れていても、一度 review を始めた痕跡がある Issue は gate 対象に
  // 残す。「レビューが止まった Issue からラベルを剥がして軽量経路で着手する」
  // という迂回を塞ぐため（#2530 Issue Review P2）。正当な再分類をしたい場合は、
  // current な pass 証跡を作るか、この gate 自体の契約を別 issue で変更する。
  const startedReview = hasAnyIssueReviewEvidence(issue.comments);
  if (!hasLabel && !startedReview) {
    return { required: false, ok: true };
  }

  const fingerprint = computeIssueFingerprintFromIssue(issue);
  const result = validateIssueReviewEvidence({
    comments: issue.comments,
    issueNumber,
    expectedFingerprint: fingerprint,
  });

  return {
    required: true,
    requiredBy: hasLabel ? REVIEW_RELEVANT_LABEL : 'existing-review-evidence',
    ok: result.ok,
    fingerprint,
    reason: result.reason,
    steps: result.steps,
    truncated: issue.commentsTotalCount > COMMENT_WINDOW,
  };
}

// --- CLI -------------------------------------------------------------

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

  const issueRaw = flags.get('issue') ?? positional[0];
  if (!issueRaw || !/^\d+$/.test(issueRaw)) {
    throw new Error(
      'issue 番号を指定してください: node scripts/tasks/issue-review-gate.mjs --issue <N>',
    );
  }

  return { issueNumber: Number(issueRaw), repo: flags.get('repo') ?? DEFAULT_REPO };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`❌ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  let result;
  try {
    result = runIssueReviewGate(args);
  } catch (err) {
    // 取得失敗は「未確認のまま通す」ではなく停止に倒す（fail closed）。
    process.stderr.write(
      `❌ issue #${args.issueNumber} の Issue Review 証跡を確認できませんでした（fail closed）。\n` +
        `   ${err instanceof Error ? err.message : String(err)}\n` +
        '   gh の認証とネットワークを確認して再実行してください。\n',
    );
    process.exit(1);
  }

  if (!result.required) {
    process.stdout.write(`${JSON.stringify({ required: false, ok: true })}\n`);
    return;
  }

  if (result.ok) {
    process.stdout.write(
      `${JSON.stringify({ required: true, ok: true, fingerprint: result.fingerprint })}\n`,
    );
    return;
  }

  const requiredReason =
    result.requiredBy === REVIEW_RELEVANT_LABEL
      ? `${REVIEW_RELEVANT_LABEL} ラベルが付いています`
      : `過去に ${REVIEW_RELEVANT_LABEL} として review が開始された痕跡があります（ラベル削除では降格しません）`;
  process.stderr.write(
    `❌ issue #${args.issueNumber} は${requiredReason}が、有効な Codex Issue Review の証跡がありません。\n` +
      `   原因: ${result.reason}\n` +
      '   手順: ① issue へ「@codex このIssueを実装前レビューしてください。…」を投稿し Codex の返信を待つ\n' +
      '         ② P1/P2 は本文修正・反論・scope 分割のいずれかで解決する\n' +
      '         ③ pnpm review:issue:marker <N> --p1 <件数> --p2 <件数> で marker を生成し、内容を確認して投稿する\n' +
      `         （.claude/skills/dispatch/SKILL.md 操作A、Codex bot は ${CODEX_BOT_LOGIN}）\n`,
  );
  if (result.truncated) {
    process.stderr.write(
      `   なお、この issue はコメントが ${COMMENT_WINDOW} 件を超えており直近 ${COMMENT_WINDOW} 件しか見ていません。\n` +
        '   証跡が窓の外へ落ちている場合は marker を投稿し直してください。\n',
    );
  }
  process.exit(1);
}

if (isDirectExecution(import.meta.url)) {
  main();
}
