import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  DECISIONS_PATH,
  hasRemovedOrModifiedLine,
  runDecisionsAppendOnlyGuard,
} from '../checks/decisions-append-only.ts';

const temporaryDirectories: string[] = [];

function git(root: string, ...args: string[]): void {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' });
}

function write(root: string, path: string, content: string): void {
  const absolutePath = join(root, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

const INITIAL_CONTENT = `# 決定ログ（append-only）

- 2026-01-01: old (#1) https://github.com/o/r/issues/1
`;

function createRepository(): string {
  const root = mkdtempSync(join(tmpdir(), 'dayopt-decisions-append-only-'));
  temporaryDirectories.push(root);
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Docs Guard Test');
  git(root, 'config', 'user.email', 'docs-guard@example.test');
  write(root, DECISIONS_PATH, INITIAL_CONTENT);
  git(root, 'add', 'docs');
  git(root, 'commit', '-qm', 'initial');
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('hasRemovedOrModifiedLine', () => {
  it('追加行のみのdiffはfalse', () => {
    expect(
      hasRemovedOrModifiedLine(`--- a/docs/decisions.md
+++ b/docs/decisions.md
@@ -3,0 +4 @@
+- 2026-08-19: new (#2) https://github.com/o/r/issues/2
`),
    ).toBe(false);
  });

  it('削除行を含むdiffはtrue', () => {
    expect(
      hasRemovedOrModifiedLine(`--- a/docs/decisions.md
+++ b/docs/decisions.md
@@ -3 +3 @@
-- 2026-01-01: old (#1) https://github.com/o/r/issues/1
+- 2026-01-01: edited (#1) https://github.com/o/r/issues/1
`),
    ).toBe(true);
  });

  it('---/+++のファイルヘッダは削除行として扱わない', () => {
    expect(
      hasRemovedOrModifiedLine(`--- a/docs/decisions.md
+++ b/docs/decisions.md
@@ -3,0 +4 @@
+- 2026-08-19: new (#2) https://github.com/o/r/issues/2
`),
    ).toBe(false);
  });
});

describe('runDecisionsAppendOnlyGuard', () => {
  it('新規行の追記のみなら違反なし', () => {
    const root = createRepository();
    write(
      root,
      DECISIONS_PATH,
      `${INITIAL_CONTENT}- 2026-08-19: new (#2) https://github.com/o/r/issues/2\n`,
    );

    expect(runDecisionsAppendOnlyGuard({ baseRef: 'HEAD', root })).toEqual([]);
  });

  it('既存行の変更を拒否する', () => {
    const root = createRepository();
    write(
      root,
      DECISIONS_PATH,
      '# 決定ログ（append-only）\n\n- 2026-01-01: EDITED (#1) https://github.com/o/r/issues/1\n',
    );

    const violations = runDecisionsAppendOnlyGuard({ baseRef: 'HEAD', root });
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toContain('削除・変更');
  });

  it('ファイル削除を拒否する', () => {
    const root = createRepository();
    execFileSync('rm', [join(root, DECISIONS_PATH)]);
    git(root, 'add', '-A');

    const violations = runDecisionsAppendOnlyGuard({ baseRef: 'HEAD', root });
    expect(violations).toHaveLength(1);
    expect(violations[0].reason).toContain('削除している');
  });

  it('新規作成（初回コミット）は許可する', () => {
    const root = mkdtempSync(join(tmpdir(), 'dayopt-decisions-append-only-new-'));
    temporaryDirectories.push(root);
    git(root, 'init', '-q');
    git(root, 'config', 'user.name', 'Docs Guard Test');
    git(root, 'config', 'user.email', 'docs-guard@example.test');
    write(root, 'README.md', 'placeholder\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'base');

    write(root, DECISIONS_PATH, INITIAL_CONTENT);
    git(root, 'add', '.');

    expect(runDecisionsAppendOnlyGuard({ baseRef: 'HEAD', root })).toEqual([]);
  });

  it('docs/decisions.md と無関係な変更では発火しない', () => {
    const root = createRepository();
    write(root, 'docs/other.md', 'unrelated\n');
    git(root, 'add', '.');

    expect(runDecisionsAppendOnlyGuard({ baseRef: 'HEAD', root })).toEqual([]);
  });
});
