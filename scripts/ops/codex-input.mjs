import { execFileSync } from 'node:child_process';

import { isDirectExecution } from '../lib/is-direct-execution.mjs';

/**
 * Codex（`CLAUDE.md` §Codex（別系統批評係）の利用）へ渡す入力を組み立てる
 * wrapper（#2421）。
 *
 * 背景: Codex は `--sandbox read-only` で実行するため `api.github.com` へ
 * 到達できず、対象 issue/PR が本文中で参照する他 issue（`Depends on: #N`
 * 等）を自力で読めない（#2419 で実測: #2396 への Codex A 実行トレースに
 * `error connecting to api.github.com` が出た）。指揮台側で参照先 issue を
 * 1 段階だけ解決し、対象本文と連結してから Codex へ渡す。
 *
 * 設計原則は night-watch wrapper 群（`scripts/night-watch/lib.mjs`）と同型:
 * 動的な値は execFile の argv 要素としてのみ渡し、shell を経由しない。
 * ただし night-watch 内部実装（`REPO` 等）を import して layering を濁らせ
 * ないため、この2定数だけ同型のまま複製する。
 */

const REPO = 'Dayopt/dayopt';

/**
 * @typedef {(file: string, args: string[], options?: object) => string} ExecFileImpl
 */

/**
 * gh CLI を execFile 経由で呼ぶ（shell を経由しない）。
 * @param {string[]} args
 * @param {{ execFileImpl?: ExecFileImpl }} [opts]
 */
export function runGh(args, { execFileImpl = execFileSync } = {}) {
  return execFileImpl('gh', args, { encoding: 'utf8' });
}

/** @param {string[]} args @param {{ execFileImpl?: ExecFileImpl }} [opts] */
export function runGhJson(args, opts = {}) {
  return JSON.parse(runGh(args, opts));
}

// GitHub issue/PR 番号の上限（run-log.mjs の MAX_ISSUE_NUMBER と同じ考え方 —
// 上限の無い整数は低帯域の covert channel になり得るため現実的な値で絞る）。
const MAX_ISSUE_NUMBER = 9_999_999;

function isPositiveIssueNumber(value) {
  return Number.isInteger(value) && value > 0 && value <= MAX_ISSUE_NUMBER;
}

const REF_RE = /#(\d+)/g;

/**
 * 本文中の `#\d+` 参照を抽出する（重複除去、`exclude` で自己参照を除く）。
 * @param {string} text
 * @param {{ exclude?: number }} [opts]
 * @returns {number[]}
 */
export function extractReferencedIssueNumbers(text, { exclude } = {}) {
  const found = new Set();
  for (const match of (text ?? '').matchAll(REF_RE)) {
    const n = Number(match[1]);
    if (isPositiveIssueNumber(n) && n !== exclude) found.add(n);
  }
  return [...found];
}

/**
 * 参照先 issue を 1 件解決する。取得失敗は `ok: false` として返す（例外を
 * 投げない — 呼び出し元が「取得失敗」として Codex へそのまま伝える設計、
 * #2421 やること 2「解決できなかった番号は『#NNNN: 取得失敗』と明記する」）。
 * @param {number} number
 * @param {{ execFileImpl?: ExecFileImpl }} [opts]
 */
export function resolveReferencedIssue(number, { execFileImpl } = {}) {
  try {
    const result = runGhJson(
      ['issue', 'view', String(number), '--repo', REPO, '--json', 'title,body'],
      { execFileImpl },
    );
    return { number, ok: true, title: result.title, body: result.body ?? '' };
  } catch {
    return { number, ok: false };
  }
}

/**
 * 対象本文 + 解決済み参照先を Codex への入力テキストへ組み立てる。
 * @param {{ target: { title: string, body: string }, references: Array<{ number: number, ok: boolean, title?: string, body?: string }> }} params
 */
export function buildCodexInput({ target, references }) {
  const parts = [`# ${target.title}\n\n${target.body ?? ''}`];
  for (const ref of references) {
    parts.push(
      ref.ok
        ? `## 参照先 #${ref.number}: ${ref.title}\n\n${ref.body}`
        : `## 参照先 #${ref.number}: 取得失敗`,
    );
  }
  return parts.join('\n\n---\n\n');
}

/**
 * issue 本文 + 1 段階参照解決を Codex への入力として組み立てる（Codex A: 設計
 * レビュー向け）。
 * @param {number} issueNumber
 * @param {{ execFileImpl?: ExecFileImpl }} [opts]
 */
export function buildIssueCodexInput(issueNumber, { execFileImpl } = {}) {
  if (!isPositiveIssueNumber(issueNumber)) {
    throw new Error(`issue番号が不正です: ${issueNumber}`);
  }
  const target = runGhJson(
    ['issue', 'view', String(issueNumber), '--repo', REPO, '--json', 'title,body'],
    { execFileImpl },
  );
  const refNumbers = extractReferencedIssueNumbers(target.body ?? '', { exclude: issueNumber });
  const references = refNumbers.map((n) => resolveReferencedIssue(n, { execFileImpl }));
  return buildCodexInput({ target: { title: target.title, body: target.body ?? '' }, references });
}

/**
 * PR diff + PR 本文からの 1 段階参照解決を Codex への入力として組み立てる
 * （Codex C: PR クロスレビュー向け）。
 * @param {number} prNumber
 * @param {{ execFileImpl?: ExecFileImpl }} [opts]
 */
export function buildPrCodexInput(prNumber, { execFileImpl } = {}) {
  if (!isPositiveIssueNumber(prNumber)) {
    throw new Error(`PR番号が不正です: ${prNumber}`);
  }
  const pr = runGhJson(['pr', 'view', String(prNumber), '--repo', REPO, '--json', 'title,body'], {
    execFileImpl,
  });
  const diff = runGh(['pr', 'diff', String(prNumber), '--repo', REPO], { execFileImpl });
  const refNumbers = extractReferencedIssueNumbers(pr.body ?? '', { exclude: prNumber });
  const references = refNumbers.map((n) => resolveReferencedIssue(n, { execFileImpl }));
  if (references.length === 0) return diff;
  const refSection = references
    .map((ref) =>
      ref.ok
        ? `## 参照先 #${ref.number}: ${ref.title}\n\n${ref.body}`
        : `## 参照先 #${ref.number}: 取得失敗`,
    )
    .join('\n\n---\n\n');
  return `${diff}\n\n---\n\n${refSection}`;
}

if (isDirectExecution(import.meta.url)) {
  const [subcommand, arg] = process.argv.slice(2);
  const num = Number(arg);
  try {
    if (subcommand === 'issue' && Number.isInteger(num)) {
      process.stdout.write(buildIssueCodexInput(num));
    } else if (subcommand === 'pr' && Number.isInteger(num)) {
      process.stdout.write(buildPrCodexInput(num));
    } else {
      console.error('Usage: node scripts/ops/codex-input.mjs <issue|pr> <番号>');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'codex-input failed');
    process.exitCode = 1;
  }
}
