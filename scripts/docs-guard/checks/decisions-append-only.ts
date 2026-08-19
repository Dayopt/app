/**
 * Check: docs/decisions.md の append-only 契約
 *
 * `docs/decisions.md` は `pnpm state:generate` が既存行を残したまま新規行だけを
 * 追記する append-only ファイル（`docs/{domain}/log/` の凍結契約とは違い、
 * 単一ファイルへの継続的な追記モデル）。既存の append-only-guard は
 * `docs/<domain>/log/` ディレクトリ配下の frontmatter supersede 契約専用のため、
 * この形には適合しない。ここでは「diff に削除・変更行が無いこと」だけを機械検証する。
 */

import { execSync } from 'node:child_process';

import { colors, git, resolveBaseRef, ROOT } from '../config.ts';
import { listGitChanges } from '../git-changes.ts';

export interface DecisionsAppendOnlyViolation {
  file: string;
  reason: string;
}

export const DECISIONS_PATH = 'docs/decisions.md';

interface RunDecisionsAppendOnlyGuardOptions {
  baseRef?: string;
  root?: string;
}

/** diff（`-U0`）に削除・変更行があるかを判定する。`---`/`+++` のファイルヘッダは除外する。 */
export function hasRemovedOrModifiedLine(diff: string): boolean {
  return diff
    .split('\n')
    .some(
      (line) =>
        line.startsWith('-') && !line.startsWith('---') && line !== '\\ No newline at end of file',
    );
}

export function runDecisionsAppendOnlyGuard({
  baseRef = resolveBaseRef(),
  root = ROOT,
}: RunDecisionsAppendOnlyGuardOptions = {}): DecisionsAppendOnlyViolation[] {
  const runGit = (args: string): string =>
    root === ROOT ? git(args) : execSync(`git ${args}`, { cwd: root, encoding: 'utf8' });
  const mergeBase = runGit(`merge-base ${baseRef} HEAD`).trim();
  const violations: DecisionsAppendOnlyViolation[] = [];

  const changes = listGitChanges('docs', { baseRef, root }).filter(
    (change) => change.path === DECISIONS_PATH || change.oldPath === DECISIONS_PATH,
  );

  for (const change of changes) {
    if (change.status === 'added') continue; // 新規作成は温存対象が無いので許可

    if (change.status === 'deleted') {
      violations.push({ file: DECISIONS_PATH, reason: '決定ログ（append-only）を削除している' });
      continue;
    }

    if (change.status === 'renamed') {
      violations.push({
        file: change.oldPath ?? DECISIONS_PATH,
        reason: `決定ログ（append-only）をrenameしている: ${change.path}`,
      });
      continue;
    }

    const diff = runGit(`diff -U0 ${mergeBase} -- "${DECISIONS_PATH}"`);
    if (hasRemovedOrModifiedLine(diff)) {
      violations.push({
        file: DECISIONS_PATH,
        reason: '既存行の削除・変更を検出（append-only は新規行の追記のみ許可）',
      });
    }
  }

  return violations;
}

export function reportDecisionsAppendOnlyGuard(
  violations: DecisionsAppendOnlyViolation[],
): boolean {
  if (violations.length === 0) {
    console.log(`${colors.green}✓${colors.reset} decisions.md append-only ガード: 違反なし`);
    return true;
  }

  console.log(
    `${colors.red}✗${colors.reset} decisions.md append-only ガード: ${violations.length}件`,
  );
  for (const violation of violations) {
    console.log(`  ${colors.yellow}${violation.file}${colors.reset}: ${violation.reason}`);
  }
  return false;
}
