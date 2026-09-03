import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  computeReviewFingerprint,
  fingerprintFromDiff,
  isValidFingerprint,
  normalizeDiffForFingerprint,
} from './review-fingerprint.mjs';

// 保護対象 path（scripts/ci/protected-path-gate.mjs の PROTECTED_PATH_GLOBS）
const PROTECTED = 'scripts/tasks/finish-branch.sh';
// 保護対象外（#2489 で必須側から外した product path）
const UNPROTECTED = 'apps/product/src/features/timeblock/lib/timeblock-status.ts';

function diffBlock(path: string, lines: string[]): string {
  return [
    `diff --git a/${path} b/${path}`,
    'index 1111111..2222222 100644',
    `--- a/${path}`,
    `+++ b/${path}`,
    '@@ -1,3 +1,3 @@',
    ' context line',
    ...lines,
    ' trailing context',
  ].join('\n');
}

describe('normalizeDiffForFingerprint', () => {
  it('scope=protected は保護対象外の file block を落とす', () => {
    const normalized = normalizeDiffForFingerprint(
      [diffBlock(PROTECTED, ['-old', '+new']), diffBlock(UNPROTECTED, ['-a', '+b'])].join('\n'),
      'protected',
    );
    expect(normalized).toContain(PROTECTED);
    expect(normalized).not.toContain(UNPROTECTED);
  });

  it('scope=all は保護対象外の file block も残す', () => {
    const normalized = normalizeDiffForFingerprint(diffBlock(UNPROTECTED, ['-a', '+b']), 'all');
    expect(normalized).toContain(UNPROTECTED);
  });

  it('hunk header・context 行・index 行を落とし、変更行だけを残す', () => {
    const normalized = normalizeDiffForFingerprint(diffBlock(PROTECTED, ['-old', '+new']));
    expect(normalized).not.toContain('@@');
    expect(normalized).not.toContain('index 1111111');
    expect(normalized).not.toContain('context line');
    expect(normalized).toContain('-old');
    expect(normalized).toContain('+new');
  });

  it('mode 変更・rename・binary の行は残す（内容が同じでもレビュー対象の性質が変わる）', () => {
    const normalized = normalizeDiffForFingerprint(
      [`diff --git a/${PROTECTED} b/${PROTECTED}`, 'old mode 100644', 'new mode 100755'].join('\n'),
    );
    expect(normalized).toContain('new mode 100755');
  });

  it('path を取り出せない block は保護対象扱いにする（判定不能は指紋が変わる側へ）', () => {
    const normalized = normalizeDiffForFingerprint(
      ['diff --git "a/weird path" "b/weird path"', '@@ -1 +1 @@', '-x', '+y'].join('\n'),
      'protected',
    );
    expect(normalized).toContain('+y');
  });

  it('未知の scope は例外にする', () => {
    expect(() => normalizeDiffForFingerprint('', 'partial' as never)).toThrow(/未知の scope/);
  });
});

describe('fingerprintFromDiff', () => {
  it('16 桁 hex を返す', () => {
    const fingerprint = fingerprintFromDiff(diffBlock(PROTECTED, ['+x']));
    expect(isValidFingerprint(fingerprint)).toBe(true);
  });

  it('保護対象の変更行が変われば値が変わる', () => {
    expect(fingerprintFromDiff(diffBlock(PROTECTED, ['+x']))).not.toBe(
      fingerprintFromDiff(diffBlock(PROTECTED, ['+y'])),
    );
  });

  it('scope=protected では保護対象外の変更で値が変わらない', () => {
    const onlyProtected = diffBlock(PROTECTED, ['+x']);
    const withExtra = [onlyProtected, diffBlock(UNPROTECTED, ['+z'])].join('\n');
    expect(fingerprintFromDiff(withExtra, 'protected')).toBe(
      fingerprintFromDiff(onlyProtected, 'protected'),
    );
  });

  it('scope=all では保護対象外の変更で値が変わる（review:full の緩和過剰を防ぐ）', () => {
    const onlyProtected = diffBlock(PROTECTED, ['+x']);
    const withExtra = [onlyProtected, diffBlock(UNPROTECTED, ['+z'])].join('\n');
    expect(fingerprintFromDiff(withExtra, 'all')).not.toBe(
      fingerprintFromDiff(onlyProtected, 'all'),
    );
  });

  it('同じ変更行なら hunk header の行番号が動いても値が変わらない', () => {
    const shifted = diffBlock(PROTECTED, ['+x']).replace('@@ -1,3 +1,3 @@', '@@ -120,3 +140,3 @@');
    expect(fingerprintFromDiff(shifted)).toBe(fingerprintFromDiff(diffBlock(PROTECTED, ['+x'])));
  });

  it('scope が違えば同じ diff でも値が変わる（scope の取り違えを素通りさせない）', () => {
    const diff = diffBlock(PROTECTED, ['+x']);
    expect(fingerprintFromDiff(diff, 'protected')).not.toBe(fingerprintFromDiff(diff, 'all'));
  });
});

// ── 実 git repo での性質確認（#2558 の中核: 追従 merge で指紋が変わらない） ──
describe('computeReviewFingerprint（実 git）', () => {
  const repositoryPath = mkdtempSync(join(tmpdir(), 'review-fingerprint-'));

  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repositoryPath, encoding: 'utf8' });

  const write = (path: string, content: string) => {
    const absolutePath = join(repositoryPath, path);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
  };

  afterAll(() => rmSync(repositoryPath, { recursive: true, force: true }));

  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');

  write(PROTECTED, 'base\n');
  write(UNPROTECTED, 'base\n');
  git('add', '-A');
  git('commit', '-qm', 'base');

  git('checkout', '-qb', 'lane');
  write(PROTECTED, 'base\nlane change\n');
  git('add', '-A');
  git('commit', '-qm', 'lane');

  const initial = computeReviewFingerprint({
    baseRef: 'main',
    headRef: 'lane',
    cwd: repositoryPath,
  });

  it('保護対象の変更がある branch で指紋が出る', () => {
    expect(isValidFingerprint(initial)).toBe(true);
  });

  it('main が進み、その追従 merge を取り込んでも指紋が変わらない', () => {
    git('checkout', '-q', 'main');
    write('docs/unrelated.md', 'main moved\n');
    git('add', '-A');
    git('commit', '-qm', 'main moves');

    git('checkout', '-q', 'lane');
    git('merge', '-q', '--no-edit', 'main');

    expect(
      computeReviewFingerprint({ baseRef: 'main', headRef: 'lane', cwd: repositoryPath }),
    ).toBe(initial);
  });

  it('保護対象外の file を lane で変えても scope=protected の指紋は変わらない', () => {
    write(UNPROTECTED, 'base\nunprotected change\n');
    git('add', '-A');
    git('commit', '-qm', 'unprotected change');

    expect(
      computeReviewFingerprint({ baseRef: 'main', headRef: 'lane', cwd: repositoryPath }),
    ).toBe(initial);
  });

  it('同じ commit でも scope=all なら保護対象外の変更で指紋が変わる', () => {
    expect(
      computeReviewFingerprint({
        baseRef: 'main',
        headRef: 'lane',
        scope: 'all',
        cwd: repositoryPath,
      }),
    ).not.toBe(initial);
  });

  it('保護対象を追加で変更すると指紋が変わる', () => {
    write(PROTECTED, 'base\nlane change\nsecond lane change\n');
    git('add', '-A');
    git('commit', '-qm', 'second protected change');

    expect(
      computeReviewFingerprint({ baseRef: 'main', headRef: 'lane', cwd: repositoryPath }),
    ).not.toBe(initial);
  });
});
