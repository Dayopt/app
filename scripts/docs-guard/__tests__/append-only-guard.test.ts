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

function addFrozenLog(root: string): string {
  const path = 'docs/product/log/2026-07-14-frozen.md';
  write(
    root,
    path,
    `---
status: frozen
date: 2026-07-14
---

# Frozen log
`,
  );
  git(root, 'add', path);
  git(root, 'commit', '-qm', 'add frozen log');
  return path;
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

  it('エラー系: metadata追記と同時の空行追加も拒否する', () => {
    expect(
      isSupersedeOnlyDiff(`--- a/log.md
+++ b/log.md
@@ -3,0 +4,2 @@
+superseded_by: docs/product/log/2026-08-01-new.md
+
`),
    ).toBe(false);
  });

  it('エラー系: hunk内の+++で始まる追加行をfile headerと誤認しない', () => {
    expect(
      isSupersedeOnlyDiff(`--- a/log.md
+++ b/log.md
@@ -3,0 +4,2 @@
+superseded_by: docs/product/log/2026-08-01-new.md
+++ hidden body
`),
    ).toBe(false);
  });

  it('エラー系: hunk内の---で始まる削除行をfile headerと誤認しない', () => {
    expect(
      isSupersedeOnlyDiff(`--- a/log.md
+++ b/log.md
@@ -3,1 +3,1 @@
--- hidden body
+superseded_by: docs/product/log/2026-08-01-new.md
`),
    ).toBe(false);
  });
});

describe('runAppendOnlyGuard', () => {
  it('正常系: 新契約logのfrontmatterへのsuperseded_by追記を許可する', () => {
    const root = createRepository();
    const path = addFrozenLog(root);
    write(
      root,
      path,
      `---
status: frozen
date: 2026-07-14
superseded_by: docs/product/log/2026-08-01-new.md
---

# Frozen log
`,
    );

    expect(runAppendOnlyGuard({ baseRef: 'HEAD', root })).toEqual([]);
  });

  it('正常系: legacy logのstatus追記は互換性のため許可する', () => {
    const root = createRepository();
    write(
      root,
      'docs/product/log/2026-07-01-source.md',
      '---\ntitle: Source\nstatus: superseded\n---\n',
    );

    expect(runAppendOnlyGuard({ baseRef: 'HEAD', root })).toEqual([]);
  });

  it('エラー系: 新契約logへのlegacy status追記を拒否する', () => {
    const root = createRepository();
    const path = addFrozenLog(root);
    write(
      root,
      path,
      `---
status: frozen
status: superseded
date: 2026-07-14
---

# Frozen log
`,
    );

    expect(runAppendOnlyGuard({ baseRef: 'HEAD', root })).toEqual([
      {
        file: path,
        reason: '新契約logの変更はfrontmatterへのsuperseded_by追記だけ許可',
      },
    ]);
  });

  it('エラー系: 新契約logの本文へのsuperseded_by追記を拒否する', () => {
    const root = createRepository();
    const path = addFrozenLog(root);
    write(
      root,
      path,
      `---
status: frozen
date: 2026-07-14
---

# Frozen log

superseded_by: docs/product/log/2026-08-01-new.md
`,
    );

    expect(runAppendOnlyGuard({ baseRef: 'HEAD', root })).toEqual([
      {
        file: path,
        reason: '新契約logの変更はfrontmatterへのsuperseded_by追記だけ許可',
      },
    ]);
  });

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

  it('正常系: 廃止domainのlog/から現行append-onlyディレクトリへの同名rename（内容不変）を許可する', () => {
    const root = createRepository();
    const content = '---\nstatus: frozen\ndate: 2026-07-05\n---\n\n# Founder audit\n';
    const oldPath = 'docs/marketing/log/2026-07-05-founder-audit.md';
    const newPath = 'docs/business/log/2026-07-05-founder-audit.md';

    write(root, oldPath, content);
    git(root, 'add', oldPath);
    git(root, 'commit', '-qm', 'add legacy domain log');

    mkdirSync(dirname(join(root, newPath)), { recursive: true });
    git(root, 'mv', oldPath, newPath);
    git(root, 'commit', '-qm', 'move to business log');

    expect(runAppendOnlyGuard({ baseRef: 'HEAD~1', root })).toEqual([]);
  });

  it('エラー系: append-onlyディレクトリ間の同名renameでも内容が変わっていれば拒否する', () => {
    const root = createRepository();
    const oldPath = 'docs/marketing/log/2026-07-05-founder-audit.md';
    const newPath = 'docs/business/log/2026-07-05-founder-audit.md';

    write(root, oldPath, '---\nstatus: frozen\ndate: 2026-07-05\n---\n\n# Founder audit\n');
    git(root, 'add', oldPath);
    git(root, 'commit', '-qm', 'add legacy domain log');

    mkdirSync(dirname(join(root, newPath)), { recursive: true });
    git(root, 'mv', oldPath, newPath);
    write(
      root,
      newPath,
      '---\nstatus: frozen\ndate: 2026-07-05\n---\n\n# Founder audit (edited)\n',
    );
    git(root, 'add', newPath);
    git(root, 'commit', '-qm', 'move and edit');

    expect(runAppendOnlyGuard({ baseRef: 'HEAD~1', root })).toEqual([
      {
        file: oldPath,
        reason: `凍結済みlogをrenameしている: ${newPath}`,
      },
    ]);
  });

  it('エラー系: append-onlyディレクトリ間でもfilenameが変わるrenameは拒否する', () => {
    const root = createRepository();
    const oldPath = 'docs/product/log/2026-07-01-old-name.md';
    const newPath = 'docs/product/log/2026-07-01-new-name.md';

    write(root, oldPath, '---\nstatus: frozen\ndate: 2026-07-01\n---\n\n# Source\n');
    git(root, 'add', oldPath);
    git(root, 'commit', '-qm', 'add log');

    git(root, 'mv', oldPath, newPath);
    git(root, 'commit', '-qm', 'rename file');

    expect(runAppendOnlyGuard({ baseRef: 'HEAD~1', root })).toEqual([
      {
        file: oldPath,
        reason: `凍結済みlogをrenameしている: ${newPath}`,
      },
    ]);
  });
});
