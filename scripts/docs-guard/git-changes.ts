import { execSync } from 'node:child_process';
import { relative } from 'node:path';

import { git, resolveBaseRef, ROOT } from './config.ts';

export type GitChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed';

export interface GitChange {
  path: string;
  status: GitChangeStatus;
  oldPath?: string;
}

interface ListGitChangesOptions {
  baseRef?: string;
  root?: string;
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/');
}

function parseNameStatus(output: string): GitChange[] {
  if (!output.trim()) return [];

  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line): GitChange => {
      const [rawStatus, firstPath, secondPath] = line.split('\t');
      const code = rawStatus?.at(0);

      if (code === 'R' && firstPath && secondPath) {
        return {
          oldPath: normalizePath(firstPath),
          path: normalizePath(secondPath),
          status: 'renamed',
        };
      }

      if (!firstPath) {
        throw new Error(`git name-statusを解釈できません: ${line}`);
      }

      const status: GitChangeStatus =
        code === 'A' ? 'added' : code === 'D' ? 'deleted' : 'modified';
      return { path: normalizePath(firstPath), status };
    });
}

/**
 * base refとのmerge baseからworking treeまでの変更を返す。
 * merge baseへの`git diff`はcommitted/staged/unstagedを含み、untrackedだけ別途追加する。
 */
export function listGitChanges(
  pathspec = 'docs',
  { baseRef = resolveBaseRef(), root = ROOT }: ListGitChangesOptions = {},
): GitChange[] {
  const runGit = (args: string): string =>
    root === ROOT ? git(args) : execSync(`git ${args}`, { cwd: root, encoding: 'utf8' });
  const mergeBase = runGit(`merge-base ${baseRef} HEAD`).trim();
  const tracked = parseNameStatus(
    runGit(`diff --name-status --find-renames ${mergeBase} -- "${pathspec}"`),
  );
  const untrackedOutput = runGit(`ls-files --others --exclude-standard -- "${pathspec}"`).trim();
  const untracked: GitChange[] = untrackedOutput
    ? untrackedOutput
        .split('\n')
        .filter(Boolean)
        .map((path) => ({
          path: normalizePath(path),
          status: 'added',
        }))
    : [];

  const byPath = new Map<string, GitChange>();
  for (const change of [...tracked, ...untracked]) byPath.set(change.path, change);
  return [...byPath.values()];
}

export function toRepoPath(absolutePath: string, root = ROOT): string {
  return normalizePath(relative(root, absolutePath));
}
