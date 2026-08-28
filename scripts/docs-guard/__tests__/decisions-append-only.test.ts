import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  DECISIONS_PATH,
  hasRemovedOrModifiedEntryLines,
  parseTagVocabulary,
  runDecisionsAppendOnlyGuard,
  splitSections,
  validateEntryFormat,
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

const HEADER = `# decisions.md — 全決定の時系列索引（追記のみ）

## タグ語彙（増やすときはここを編集）
[product] [process] [infra]

---
`;

const INITIAL_CONTENT = `${HEADER}- 2026-01-01: [process] old（参照: #1）\n`;

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

function createEmptyRepository(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(root);
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Docs Guard Test');
  git(root, 'config', 'user.email', 'docs-guard@example.test');
  write(root, 'README.md', 'placeholder\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'base');
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('splitSections', () => {
  it('`---` 区切りでヘッダとエントリ領域を分ける', () => {
    const { header, entries } = splitSections(INITIAL_CONTENT);
    expect(header).toBe(HEADER);
    expect(entries).toBe('- 2026-01-01: [process] old（参照: #1）\n');
  });

  it('区切りが無ければ全体をエントリ領域扱いにする', () => {
    const { header, entries } = splitSections('no marker here');
    expect(header).toBe('');
    expect(entries).toBe('no marker here');
  });
});

describe('parseTagVocabulary', () => {
  it('タグ語彙行から角括弧タグを抽出する', () => {
    expect(parseTagVocabulary(HEADER)).toEqual(['product', 'process', 'infra']);
  });

  it('タグ語彙行が無ければ空配列', () => {
    expect(parseTagVocabulary('# no vocab here\n')).toEqual([]);
  });

  it('見出し直後に空行を挟んでも抽出できる（prettierのmarkdown整形対応）', () => {
    const headerWithBlankLine =
      '## タグ語彙（増やすときはここを編集）\n\n[product] [infra]\n\n---\n';
    expect(parseTagVocabulary(headerWithBlankLine)).toEqual(['product', 'infra']);
  });
});

describe('hasRemovedOrModifiedEntryLines', () => {
  it('新規行の追記のみはfalse', () => {
    expect(hasRemovedOrModifiedEntryLines('- a\n', '- a\n- b\n')).toBe(false);
  });

  it('既存行の変更はtrue', () => {
    expect(hasRemovedOrModifiedEntryLines('- a\n', '- A\n')).toBe(true);
  });

  it('既存行の削除はtrue', () => {
    expect(hasRemovedOrModifiedEntryLines('- a\n- b\n', '- a\n')).toBe(true);
  });
});

describe('validateEntryFormat', () => {
  const vocab = ['process', 'infra'];

  it('書式に合う新規行は違反なし', () => {
    expect(
      validateEntryFormat('- 2026-08-28: [process] 何かを決めた（理由: x）（参照: #1）\n', vocab),
    ).toEqual([]);
  });

  it('語彙外タグはfail', () => {
    const violations = validateEntryFormat('- 2026-08-28: [unknown] x（参照: #1）\n', vocab);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.reason).toContain('未知のタグ');
  });

  it('結果行がエントリ行に続いていればpass', () => {
    const content = '- 2026-08-28: [process] x（参照: #1）\n  結果(未): 検証待ち\n';
    expect(validateEntryFormat(content, vocab)).toEqual([]);
  });

  it('結果行が確定日付でもpass', () => {
    const content = '- 2026-08-28: [process] x（参照: #1）\n  結果(2026-09-01): 判明した\n';
    expect(validateEntryFormat(content, vocab)).toEqual([]);
  });

  it('結果行がエントリ行に続いていなければfail', () => {
    const violations = validateEntryFormat('  結果(未): 検証待ち\n', vocab);
    expect(violations.some((v) => v.reason.includes('結果行'))).toBe(true);
  });

  it('書式に合わない行はfail', () => {
    const violations = validateEntryFormat('これはエントリではない\n', vocab);
    expect(violations).toHaveLength(1);
  });

  it('301行を超えたらfail', () => {
    const lines = Array.from(
      { length: 301 },
      (_, i) => `- 2026-01-01: [process] entry ${i}（参照: #1）`,
    ).join('\n');
    const violations = validateEntryFormat(`${lines}\n`, vocab);
    expect(violations.some((v) => v.reason.includes('上限'))).toBe(true);
  });

  it('300行ちょうどはfailしない', () => {
    const lines = Array.from(
      { length: 300 },
      (_, i) => `- 2026-01-01: [process] entry ${i}（参照: #1）`,
    ).join('\n');
    const violations = validateEntryFormat(`${lines}\n`, vocab);
    expect(violations.some((v) => v.reason.includes('上限'))).toBe(false);
  });
});

describe('runDecisionsAppendOnlyGuard', () => {
  it('ヘッダ編集は違反なし', () => {
    const root = createRepository();
    write(
      root,
      DECISIONS_PATH,
      INITIAL_CONTENT.replace(
        '## タグ語彙（増やすときはここを編集）',
        '## タグ語彙（改訂・増やすときはここを編集）',
      ),
    );
    expect(runDecisionsAppendOnlyGuard({ baseRef: 'HEAD', root })).toEqual([]);
  });

  it('新規エントリの追記のみなら違反なし', () => {
    const root = createRepository();
    write(root, DECISIONS_PATH, `${INITIAL_CONTENT}- 2026-08-19: [infra] new（参照: #2）\n`);
    expect(runDecisionsAppendOnlyGuard({ baseRef: 'HEAD', root })).toEqual([]);
  });

  it('既存エントリ行の変更を拒否する', () => {
    const root = createRepository();
    write(root, DECISIONS_PATH, `${HEADER}- 2026-01-01: [process] EDITED（参照: #1）\n`);

    const violations = runDecisionsAppendOnlyGuard({ baseRef: 'HEAD', root });
    expect(violations.some((v) => v.reason.includes('削除・変更'))).toBe(true);
  });

  it('ファイル削除を拒否する', () => {
    const root = createRepository();
    execFileSync('rm', [join(root, DECISIONS_PATH)]);
    git(root, 'add', '-A');

    const violations = runDecisionsAppendOnlyGuard({ baseRef: 'HEAD', root });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.reason).toContain('削除している');
  });

  it('新規作成（初回コミット）は許可する', () => {
    const root = createEmptyRepository('dayopt-decisions-append-only-new-');
    write(root, DECISIONS_PATH, INITIAL_CONTENT);
    git(root, 'add', '.');

    expect(runDecisionsAppendOnlyGuard({ baseRef: 'HEAD', root })).toEqual([]);
  });

  it('新規作成でも書式違反はfailする', () => {
    const root = createEmptyRepository('dayopt-decisions-append-only-badformat-');
    write(root, DECISIONS_PATH, `${HEADER}- 2026-01-01: [unknown-tag] x（参照: #1）\n`);
    git(root, 'add', '.');

    const violations = runDecisionsAppendOnlyGuard({ baseRef: 'HEAD', root });
    expect(violations.some((v) => v.reason.includes('未知のタグ'))).toBe(true);
  });

  it('区切りを持たない旧形式からの一度きりの全面書き換えは許可する（移行PR）', () => {
    const root = mkdtempSync(join(tmpdir(), 'dayopt-decisions-append-only-migration-'));
    temporaryDirectories.push(root);
    git(root, 'init', '-q');
    git(root, 'config', 'user.name', 'Docs Guard Test');
    git(root, 'config', 'user.email', 'docs-guard@example.test');
    const legacyContent = '# 決定ログ（append-only）\n\n- 2026-01-01: legacy (#1) https://x/1\n';
    write(root, DECISIONS_PATH, legacyContent);
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'legacy format');

    write(root, DECISIONS_PATH, INITIAL_CONTENT);
    git(root, 'add', '.');

    expect(runDecisionsAppendOnlyGuard({ baseRef: 'HEAD', root })).toEqual([]);
  });

  it('移行後（旧ファイルが既に区切りを持つ）は通常どおり削除・変更を拒否する', () => {
    const root = createRepository();
    // createRepositoryの初期コミット自体が既に新形式（区切りあり）なので、
    // ここでのエントリ削除は通常の append-only 違反として扱われる。
    write(root, DECISIONS_PATH, HEADER);
    git(root, 'add', '.');

    const violations = runDecisionsAppendOnlyGuard({ baseRef: 'HEAD', root });
    expect(violations.some((v) => v.reason.includes('削除・変更'))).toBe(true);
  });

  it('docs/decisions.md と無関係な変更では発火しない', () => {
    const root = createRepository();
    write(root, 'docs/other.md', 'unrelated\n');
    git(root, 'add', '.');

    expect(runDecisionsAppendOnlyGuard({ baseRef: 'HEAD', root })).toEqual([]);
  });
});
