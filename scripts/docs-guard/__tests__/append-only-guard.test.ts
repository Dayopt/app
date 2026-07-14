import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { isSupersedeOnlyDiff, runAppendOnlyGuard } from '../checks/append-only-guard.ts';

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
  const root = mkdtempSync(join(tmpdir(), 'dayopt-append-only-'));
  temporaryDirectories.push(root);
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Docs Guard Test');
  git(root, 'config', 'user.email', 'docs-guard@example.test');
  write(root, 'docs/product/log/2026-07-01-source.md', '---\ntitle: Source\n---\n');
  git(root, 'add', 'docs');
  git(root, 'commit', '-qm', 'initial');
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('isSupersedeOnlyDiff', () => {
  it('正常系: superseded_byの追記を許可する', () => {
    expect(
      isSupersedeOnlyDiff(`diff --git a/log.md b/log.md
--- a/log.md
+++ b/log.md
@@ -2,0 +3 @@
+superseded_by: docs/product/log/2026-08-01-new.md
`),
    ).toBe(true);
  });

  it('legacy status: supersededの追記を許可する', () => {
    expect(
      isSupersedeOnlyDiff(`--- a/log.md
+++ b/log.md
@@ -1,0 +2 @@
+status: superseded
`),
    ).toBe(true);
  });

  it('エラー系: 本文追記を拒否する', () => {
    expect(
      isSupersedeOnlyDiff(`--- a/log.md
+++ b/log.md
@@ -10,0 +11 @@
+追記した本文
`),
    ).toBe(false);
  });

  it('エラー系: 既存行の削除を拒否する', () => {
    expect(
      isSupersedeOnlyDiff(`--- a/log.md
+++ b/log.md
@@ -2 +2 @@
-status: current
+status: superseded
`),
    ).toBe(false);
  });
});

describe('runAppendOnlyGuard', () => {
  it('base refが同じlogを先行更新していてもbranch側の追記だけを検査する', () => {
    const root = createRepository();
    git(root, 'branch', 'base');
    git(root, 'branch', 'feature');

    git(root, 'switch', '-q', 'base');
    write(
      root,
      'docs/product/log/2026-07-01-source.md',
      '---\ntitle: Source\nsuperseded_by: docs/product/log/2026-07-02-base.md\n---\n',
    );
    git(root, 'add', 'docs/product/log/2026-07-01-source.md');
    git(root, 'commit', '-qm', 'advance base');

    git(root, 'switch', '-q', 'feature');
    write(
      root,
      'docs/product/log/2026-07-01-source.md',
      '---\ntitle: Source\nsuperseded_by: docs/product/log/2026-07-03-feature.md\n---\n',
    );
    git(root, 'add', 'docs/product/log/2026-07-01-source.md');
    git(root, 'commit', '-qm', 'supersede on feature');

    expect(runAppendOnlyGuard({ baseRef: 'base', root })).toEqual([]);
  });
});
