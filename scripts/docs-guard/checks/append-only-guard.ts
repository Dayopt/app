/**
 * Check: log immutability
 *
 * base refからworking treeまで（committed / staged / unstaged / untracked）を検査する。
 * 新規fileは許可し、既存fileはsupersede metadataの追記以外を拒否する。
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  APPEND_ONLY_DIRS,
  colors,
  FORBIDDEN_LOG_ALIASES,
  git,
  resolveBaseRef,
  ROOT,
} from '../config.ts';
import { listGitChanges } from '../git-changes.ts';
import { isFrontmatterSupersededByAddition, usesFrozenLogContract } from './frontmatter-check.ts';

export interface AppendOnlyViolation {
  file: string;
  reason: string;
}

interface RunAppendOnlyGuardOptions {
  baseRef?: string;
  root?: string;
}

const SUPERSEDED_BY_LINE_RE = /^\+superseded_by:\s*\S+\s*$/;
const LEGACY_STATUS_LINE_RE = /^\+status:\s*superseded\s*$/;

interface SupersedeDiffOptions {
  allowLegacyStatus?: boolean;
}

export function isSupersedeOnlyDiff(
  diff: string,
  { allowLegacyStatus = true }: SupersedeDiffOptions = {},
): boolean {
  const lines = diff.split('\n');
  const additions: string[] = [];
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith('-')) return false;

    if (line.startsWith('+')) additions.push(line);
  }

  if (additions.length !== 1) return false;
  const [addition] = additions;
  return (
    (addition !== undefined && SUPERSEDED_BY_LINE_RE.test(addition)) ||
    (allowLegacyStatus && addition !== undefined && LEGACY_STATUS_LINE_RE.test(addition))
  );
}

function isLogPath(path: string): boolean {
  return APPEND_ONLY_DIRS.some((directory) => path.startsWith(`${directory}/`));
}

export function runAppendOnlyGuard({
  baseRef = resolveBaseRef(),
  root = ROOT,
}: RunAppendOnlyGuardOptions = {}): AppendOnlyViolation[] {
  const runGit = (args: string): string =>
    root === ROOT ? git(args) : execSync(`git ${args}`, { cwd: root, encoding: 'utf8' });
  const mergeBase = runGit(`merge-base ${baseRef} HEAD`).trim();
  const violations: AppendOnlyViolation[] = [];

  for (const change of listGitChanges('docs', { baseRef, root })) {
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

    const diff = runGit(`diff -U0 ${mergeBase} -- "${change.path}"`);
    const previousContent = runGit(`show ${mergeBase}:"${change.path}"`);
    const usesFrozenContract = usesFrozenLogContract(previousContent, change.path);
    const hasAllowedDiff = isSupersedeOnlyDiff(diff, {
      allowLegacyStatus: !usesFrozenContract,
    });

    if (hasAllowedDiff && !usesFrozenContract) continue;

    if (hasAllowedDiff && usesFrozenContract) {
      const currentContent = readFileSync(resolve(root, change.path), 'utf8');
      if (isFrontmatterSupersededByAddition(previousContent, currentContent)) continue;
    }

    violations.push({
      file: change.path,
      reason: usesFrozenContract
        ? '新契約logの変更はfrontmatterへのsuperseded_by追記だけ許可'
        : 'legacy logの変更はsuperseded_byまたはstatus: supersededの単一行追記だけ許可',
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
