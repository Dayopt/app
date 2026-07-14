/**
 * Check: log immutability
 *
 * base refからworking treeまで（committed / staged / unstaged / untracked）を検査する。
 * 新規fileは許可し、既存fileはsupersede metadataの追記以外を拒否する。
 */

import { APPEND_ONLY_DIRS, colors, FORBIDDEN_LOG_ALIASES, git, resolveBaseRef } from '../config.ts';
import { listGitChanges } from '../git-changes.ts';

export interface AppendOnlyViolation {
  file: string;
  reason: string;
}

const SUPERSEDE_LINE_RE = /^\+(superseded_by:\s*\S+|status:\s*superseded)\s*$/;
const BLANK_ADDITION_RE = /^\+\s*$/;

export function isSupersedeOnlyDiff(diff: string): boolean {
  const lines = diff.split('\n');
  let hasAddition = false;

  for (const line of lines) {
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue;
    if (line.startsWith('-')) return false;

    if (line.startsWith('+')) {
      if (BLANK_ADDITION_RE.test(line)) continue;
      if (!SUPERSEDE_LINE_RE.test(line)) return false;
      hasAddition = true;
    }
  }

  return hasAddition;
}

function isLogPath(path: string): boolean {
  return APPEND_ONLY_DIRS.some((directory) => path.startsWith(`${directory}/`));
}

export function runAppendOnlyGuard(): AppendOnlyViolation[] {
  const baseRef = resolveBaseRef();
  const violations: AppendOnlyViolation[] = [];

  for (const change of listGitChanges('docs')) {
    const touchesLog =
      isLogPath(change.path) || (change.oldPath ? isLogPath(change.oldPath) : false);
    if (!touchesLog) continue;

    if (change.status === 'added') continue;

    if (change.status === 'deleted' && FORBIDDEN_LOG_ALIASES.includes(change.path)) {
      continue;
    }

    if (change.status === 'deleted') {
      violations.push({ file: change.path, reason: '凍結済みlogを削除している' });
      continue;
    }

    if (change.status === 'renamed') {
      violations.push({
        file: change.oldPath ?? change.path,
        reason: `凍結済みlogをrenameしている: ${change.path}`,
      });
      continue;
    }

    const diff = git(`diff -U0 ${baseRef} -- "${change.path}"`);
    if (isSupersedeOnlyDiff(diff)) continue;

    violations.push({
      file: change.path,
      reason: '凍結済みlogの変更はsuperseded_by（legacyはstatus: superseded）の追記だけ許可',
    });
  }

  return violations;
}

export function reportAppendOnlyGuard(violations: AppendOnlyViolation[]): boolean {
  if (violations.length === 0) {
    console.log(`${colors.green}✓${colors.reset} log凍結ガード: 違反なし`);
    return true;
  }

  console.log(`${colors.red}✗${colors.reset} log凍結ガード: ${violations.length}件`);
  for (const violation of violations) {
    console.log(`  ${colors.yellow}${violation.file}${colors.reset}: ${violation.reason}`);
  }
  return false;
}
