/**
 * Check: 追記専用ガード（最重要）
 *
 * docs/log/decisions, docs/log/notes, docs/log/journal, docs/log/sessions（sessions/latest.md を除く）は
 * 「ログは書き換えない、訂正は supersede」の規約を持つ append-only 領域。
 * base ref との差分で "M"（modified）扱いのファイルがあれば原則 fail する。
 *
 * 例外: 変更内容が frontmatter への `superseded_by:` 行追加、または
 * `status: superseded` 行追加のみである場合は pass にする（削除行が無く、
 * 追加行が全てこのパターンに一致する場合のみ）。
 */

import { APPEND_ONLY_DIRS, APPEND_ONLY_EXCLUDE, colors, git, resolveBaseRef } from '../config.ts';

export interface AppendOnlyViolation {
  file: string;
  reason: string;
}

const SUPERSEDE_LINE_RE = /^\+(superseded_by:\s*\S+|status:\s*superseded)\s*$/;
// 追加された空行（frontmatter/本文の区切り整形）は supersede 追記に伴う自然な差分として許容
const BLANK_ADDITION_RE = /^\+\s*$/;

function isSupersedeOnlyDiff(diff: string): boolean {
  const lines = diff.split('\n');
  let hasAddition = false;

  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue;

    if (line.startsWith('-')) {
      // 削除行が1行でもあれば supersede-only ではない
      return false;
    }

    if (line.startsWith('+')) {
      if (BLANK_ADDITION_RE.test(line)) continue;
      if (!SUPERSEDE_LINE_RE.test(line)) return false;
      hasAddition = true;
    }
  }

  return hasAddition;
}

export function runAppendOnlyGuard(): AppendOnlyViolation[] {
  const baseRef = resolveBaseRef();
  const violations: AppendOnlyViolation[] = [];

  const pathspecs = [...APPEND_ONLY_DIRS, ...APPEND_ONLY_EXCLUDE.map((p) => `:(exclude)${p}`)];

  const modifiedRaw = git(
    `diff --diff-filter=M --name-only ${baseRef}...HEAD -- ${pathspecs.map((p) => `"${p}"`).join(' ')}`,
  ).trim();

  if (!modifiedRaw) return violations;

  const modifiedFiles = modifiedRaw.split('\n').filter(Boolean);

  for (const file of modifiedFiles) {
    const diff = git(`diff -U0 ${baseRef}...HEAD -- "${file}"`);

    if (isSupersedeOnlyDiff(diff)) continue;

    violations.push({
      file,
      reason:
        'append-only 領域のファイルが書き換えられている（supersede は superseded_by: / status: superseded の行追加のみで行う）',
    });
  }

  return violations;
}

export function reportAppendOnlyGuard(violations: AppendOnlyViolation[]): boolean {
  if (violations.length === 0) {
    console.log(`${colors.green}✓${colors.reset} 追記専用ガード: 違反なし`);
    return true;
  }

  console.log(`${colors.red}✗${colors.reset} 追記専用ガード違反: ${violations.length}件`);
  for (const v of violations) {
    console.log(`  ${colors.yellow}${v.file}${colors.reset}: ${v.reason}`);
  }
  return false;
}
