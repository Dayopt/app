#!/usr/bin/env node
/**
 * `pnpm review:request <PR番号>` — Codex への再依頼を「必要な時だけ 1 回」にする（#2558）。
 *
 * PR #2554 の実測（2026-09-02）: fix を 6 回別々に push + 追従 merge 1 回で HEAD が
 * 7 回動き、`@codex review` を 8 回投稿（うち 3 回は応答前の連投）、Codex の応答 7 回の
 * うち 6 回が「問題なし」、CI が 10 回走った。「1 round = 1 push」「追従してから
 * レビュー」は AGENTS.md / pr-cross-review skill の散文にあったが、機械が止めないので
 * 守られなかった。
 *
 * このスクリプトは投稿の前に順番に確認し、**投稿しなくてよい理由が 1 つでもあれば
 * 投稿しない**:
 *
 *   1. `mergeStateStatus` が BEHIND / DIRTY → 「先に追従」と言って exit 1
 *      （追従前にレビューを投げると、追従後にもう一度必要になる）
 *   2. CI が実行中 → 「CI 待ち」で exit 0（CI red の修正で HEAD が動くため）
 *   3. 既存の Codex 証跡の指紋が現在の diff と一致 → 「有効、再依頼不要」で exit 0
 *   4. 直前の `@codex review` に Codex がまだ応答していない → 「応答待ち」で exit 0
 *   5. ここまで来て初めて `gh pr comment` を 1 回だけ実行する
 *
 * 3 は #2558 の中核。Codex は毎回 PR 全体を読むので、証跡は「その commit の全量
 * レビュー」を意味する。旧 HEAD 向けの証跡でも、その commit の diff の指紋が現在の
 * diff の指紋と一致するなら、Codex が読んだ diff は現在の diff と同じ。
 *
 * Usage:
 *   pnpm review:request 2554
 *   pnpm review:request 2554 --dry-run   # 判定だけして投稿しない
 */

import { execFileSync } from 'node:child_process';

import { isDirectExecution } from '../lib/is-direct-execution.mjs';
import { fingerprintFromDiff } from '../lib/review-fingerprint.mjs';

/** Codex GitHub 連携 bot の login（GraphQL 表記。REST は `[bot]` 付き）。 */
const CODEX_BOT_LOGIN = 'chatgpt-codex-connector';

/** 依頼本文。gate が見るのは Codex 側の証跡なので、本文は起動トリガーでしかない。 */
const REVIEW_REQUEST_BODY = '@codex review';

/** 指紋照合に使う compare の候補上限（1 候補 = API 1 回）。 */
const FINGERPRINT_CANDIDATE_LIMIT = 3;

export const EXIT = {
  posted: 0,
  notNeeded: 0,
  blocked: 1,
};

function gh(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  } catch (error) {
    if (allowFailure) return '';
    throw error;
  }
}

function ghJson(args) {
  const raw = gh(args, { allowFailure: true });
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * `review:full` ラベルがあれば scope=all。無ければ保護対象 path の一致で必須化された
 * 前提で scope=protected。**`finish-branch.sh` 側の判定（linked issue の継承を含む）と
 * 完全一致はしない**が、`pnpm review:marker` は両方の指紋を status に載せるため、
 * ここでの取り違えは「緩和が効かない（= 再依頼する）」側にしか倒れない。
 */
export function resolveScope(labels) {
  return labels.some((label) => label === 'review:full') ? 'all' : 'protected';
}

/** statusCheckRollup から「まだ動いている check があるか」を判定する。 */
export function hasPendingChecks(rollup) {
  return (rollup ?? []).some((entry) => {
    const status = entry?.status ?? '';
    const state = entry?.state ?? '';
    return (
      status === 'IN_PROGRESS' || status === 'QUEUED' || status === 'PENDING' || state === 'PENDING'
    );
  });
}

/**
 * 直前の `@codex review` に Codex がまだ応答していないか。
 *
 * 応答前の連投（PR #2554 で 3 回）は、上限（#2584）を無駄に消費するだけで
 * レビューを 1 つも増やさない。
 */
export function isAwaitingCodexResponse(comments) {
  const lastRequestIndex = comments.findLastIndex((comment) =>
    (comment.body ?? '').includes(REVIEW_REQUEST_BODY),
  );
  if (lastRequestIndex === -1) return false;
  return !comments
    .slice(lastRequestIndex + 1)
    .some((comment) => normalizeLogin(comment.author?.login ?? '') === CODEX_BOT_LOGIN);
}

function normalizeLogin(login) {
  return login.replace(/\[bot\]$/, '');
}

function fingerprintOfCommit(sha, baseRef, scope) {
  const diff = gh(
    [
      'api',
      '-H',
      'Accept: application/vnd.github.v3.diff',
      `repos/{owner}/{repo}/compare/${baseRef}...${sha}`,
    ],
    { allowFailure: true },
  );
  if (!diff.trim()) return '';
  return fingerprintFromDiff(diff, scope);
}

function main(argv) {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const prNumber = positional[0];
  if (!prNumber || !/^\d+$/.test(prNumber)) {
    process.stderr.write('PR 番号を指定してください（例: pnpm review:request 2554）。\n');
    return EXIT.blocked;
  }
  const dryRun = argv.includes('--dry-run');

  const pr = ghJson([
    'pr',
    'view',
    prNumber,
    '--json',
    'mergeStateStatus,headRefOid,baseRefName,isDraft,statusCheckRollup,labels',
  ]);
  if (!pr) {
    process.stderr.write(
      `PR #${prNumber} を取得できませんでした（gh の認証を確認してください）。\n`,
    );
    return EXIT.blocked;
  }

  // 1. 追従されていない PR にレビューを投げない
  if (pr.mergeStateStatus === 'BEHIND' || pr.mergeStateStatus === 'DIRTY') {
    process.stderr.write(
      `先に main を追従してください（mergeStateStatus: ${pr.mergeStateStatus}）。\n` +
        '追従前にレビューを投げると、追従後にもう一度必要になります。\n',
    );
    return EXIT.blocked;
  }

  // 2. CI 実行中は待つ（red の修正で HEAD が動くため）
  if (hasPendingChecks(pr.statusCheckRollup)) {
    process.stdout.write(
      'CI が実行中です。green を確認してから依頼してください（pnpm green:watch <PR> --once）。\n',
    );
    return EXIT.notNeeded;
  }

  const scope = resolveScope((pr.labels ?? []).map((label) => label.name ?? ''));
  const baseRef = pr.baseRefName || 'main';

  const currentDiff = gh(['pr', 'diff', prNumber], { allowFailure: true });
  const currentFingerprint = currentDiff.trim() ? fingerprintFromDiff(currentDiff, scope) : '';

  const evidence = ghJson([
    'api',
    'graphql',
    '-f',
    `query=query { repository(owner: "Dayopt", name: "dayopt") { pullRequest(number: ${Number(
      prNumber,
    )}) { comments(last: 100) { nodes { author { login } body } } reviews(last: 100) { nodes { author { login } state commit { oid } } } } } }`,
  ]);
  const pullRequest = evidence?.data?.repository?.pullRequest;
  if (!pullRequest) {
    process.stderr.write('PR のコメント / レビューを取得できませんでした（fail closed）。\n');
    return EXIT.blocked;
  }

  const codexReviews = (pullRequest.reviews?.nodes ?? []).filter(
    (review) =>
      normalizeLogin(review.author?.login ?? '') === CODEX_BOT_LOGIN &&
      review.state !== 'PENDING' &&
      review.state !== 'DISMISSED',
  );

  // 3. 現 HEAD の証跡があるならそもそも不要
  if (codexReviews.some((review) => (review.commit?.oid ?? '') === pr.headRefOid)) {
    process.stdout.write('現 HEAD に対する Codex の証跡が既にあります。再依頼は不要です。\n');
    return EXIT.notNeeded;
  }

  // 3'. 旧 HEAD の証跡でも、その commit の diff の指紋が現在と一致すれば有効
  if (currentFingerprint) {
    const candidates = [
      ...new Set(
        codexReviews
          .map((review) => review.commit?.oid ?? '')
          .filter((oid) => oid && oid !== pr.headRefOid),
      ),
    ].slice(0, FINGERPRINT_CANDIDATE_LIMIT);

    for (const candidate of candidates) {
      if (fingerprintOfCommit(candidate, baseRef, scope) === currentFingerprint) {
        process.stdout.write(
          `旧 HEAD (${candidate.slice(0, 10)}) の Codex 証跡が有効です（diff の指紋が一致: ` +
            `${currentFingerprint} / scope ${scope}）。再依頼は不要です。\n`,
        );
        return EXIT.notNeeded;
      }
    }
  } else {
    process.stderr.write(
      '注意: PR diff を取得できず指紋を計算できませんでした。指紋による再依頼の省略は無効です。\n',
    );
  }

  // 4. 応答前の連投を止める
  if (isAwaitingCodexResponse(pullRequest.comments?.nodes ?? [])) {
    process.stdout.write(
      '直前の「@codex review」に Codex がまだ応答していません。応答を待ってください。\n',
    );
    return EXIT.notNeeded;
  }

  // 5. ここまで来て初めて 1 回だけ投稿する
  if (dryRun) {
    process.stdout.write(`[dry-run] gh pr comment ${prNumber} --body "${REVIEW_REQUEST_BODY}"\n`);
    return EXIT.posted;
  }
  gh(['pr', 'comment', prNumber, '--body', REVIEW_REQUEST_BODY]);
  process.stdout.write(`PR #${prNumber} へ「${REVIEW_REQUEST_BODY}」を投稿しました。\n`);
  return EXIT.posted;
}

if (isDirectExecution(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
