import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { listGitChanges } from '../git-changes.ts';

const temporaryDirectories: string[] = [];

function git(root: string, ...args: string[]): void {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' });
}

function write(root: string, path: string, content: string): void {
  const absolutePath = join(root, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function createRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'dayopt-docs-git-'));
  temporaryDirectories.push(root);
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Docs Guard Test');
  git(root, 'config', 'user.email', 'docs-guard@example.test');
  write(root, 'docs/unstaged.md', 'initial\n');
  write(root, 'docs/staged.md', 'initial\n');
  git(root, 'add', 'docs');
  git(root, 'commit', '-qm', 'initial');
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('listGitChanges', () => {
  it('committed baseに対するstaged・unstaged・untrackedを全て返す', () => {
    const root = createRepository();
    write(root, 'docs/unstaged.md', 'unstaged\n');
    write(root, 'docs/staged.md', 'staged\n');
    git(root, 'add', 'docs/staged.md');
    write(root, 'docs/untracked.md', 'untracked\n');

    const changes = listGitChanges('docs', { baseRef: 'HEAD', root });

    expect(changes).toEqual(
      expect.arrayContaining([
        { path: 'docs/staged.md', status: 'modified' },
        { path: 'docs/unstaged.md', status: 'modified' },
        { path: 'docs/untracked.md', status: 'added' },
      ]),
    );
  });

  it('base refが先行していてもmerge base以降のbranch差分だけを返す', () => {
    const root = createRepository();
    git(root, 'branch', 'base');
    git(root, 'branch', 'feature');

    git(root, 'switch', '-q', 'base');
    write(root, 'docs/base-only.md', 'base only\n');
    git(root, 'add', 'docs/base-only.md');
    git(root, 'commit', '-qm', 'advance base');

    git(root, 'switch', '-q', 'feature');
    write(root, 'docs/feature-only.md', 'feature only\n');
    git(root, 'add', 'docs/feature-only.md');
    git(root, 'commit', '-qm', 'feature change');

    const changes = listGitChanges('docs', { baseRef: 'base', root });

    expect(changes).toEqual([{ path: 'docs/feature-only.md', status: 'added' }]);
  });
});
