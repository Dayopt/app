import { describe, expect, it, vi } from 'vitest';

import {
  fetchPrFilenames,
  fetchPrFilesWithStatus,
  resolveDiffBase,
  runMigrationSafety,
  shouldRunIntegrationTests,
  shouldRunProductUnitTests,
  shouldRunStaticLanes,
} from './check.mjs';

/**
 * scripts/ci/check.mjs は `.github/workflows/ci.yml` から呼ばれる CI 実行本体
 * （#2483 Phase 1）。実コマンド（pnpm / gitleaks / gh api 実行）を伴う
 * `runStatic` / `runTest` 全体はここでは検証しない — この PR 自身が新しい
 * ci.yml で実走することが実地検証にあたる（PR 本文に実測ログを記載する）。
 * ここでは affected 判定・fail-open 分岐など、DI で外部呼び出しを差し替えられる
 * 純粋なロジックだけを固定する。
 */

describe('shouldRunStaticLanes', () => {
  it('docsOnly=true（boolean）なら static lane を skip する', () => {
    expect(shouldRunStaticLanes(true)).toBe(false);
  });
  it("docsOnly='true'（GITHUB_OUTPUT 由来の文字列）なら skip する", () => {
    expect(shouldRunStaticLanes('true')).toBe(false);
  });
  it('docsOnly=false / undefined なら実行する', () => {
    expect(shouldRunStaticLanes(false)).toBe(true);
    expect(shouldRunStaticLanes(undefined)).toBe(true);
  });
});

describe('shouldRunProductUnitTests', () => {
  it("productUnit=false / 'false' なら skip する", () => {
    expect(shouldRunProductUnitTests(false)).toBe(false);
    expect(shouldRunProductUnitTests('false')).toBe(false);
  });
  it('productUnit=true / undefined（判定不能）なら実行する（fail closed = 実行側）', () => {
    expect(shouldRunProductUnitTests(true)).toBe(true);
    expect(shouldRunProductUnitTests(undefined)).toBe(true);
  });
});

describe('shouldRunIntegrationTests', () => {
  it("integrationAffected=false / 'false' なら skip する", () => {
    expect(shouldRunIntegrationTests(false)).toBe(false);
    expect(shouldRunIntegrationTests('false')).toBe(false);
  });
  it('integrationAffected=true / undefined（判定不能）なら実行する（fail closed = 実行側）', () => {
    expect(shouldRunIntegrationTests(true)).toBe(true);
    expect(shouldRunIntegrationTests(undefined)).toBe(true);
  });
});

describe('resolveDiffBase', () => {
  it('candidate が存在すればそのまま使う', () => {
    const execImpl = vi.fn(() => ({ status: 0 }));
    expect(resolveDiffBase({ candidate: 'abc123', execImpl })).toBe('abc123');
    expect(execImpl).toHaveBeenCalledWith('git', ['cat-file', '-e', 'abc123'], expect.anything());
  });

  it('candidate が存在しなければ HEAD~1 へフォールバックする', () => {
    const execImpl = vi.fn((_cmd: string, args: string[]) =>
      args.includes('HEAD~1') ? { status: 0 } : { status: 1 },
    );
    expect(resolveDiffBase({ candidate: 'missing-sha', execImpl })).toBe('HEAD~1');
  });

  it('candidate も HEAD~1 も無ければ HEAD へフォールバックする（shallow clone 等）', () => {
    const execImpl = vi.fn(() => ({ status: 1 }));
    expect(resolveDiffBase({ candidate: '', execImpl })).toBe('HEAD');
  });

  it('candidate 未指定でも同じ規約で解決する', () => {
    const execImpl = vi.fn(() => ({ status: 0 }));
    expect(resolveDiffBase({ execImpl })).toBe('HEAD~1');
  });
});

describe('fetchPrFilenames', () => {
  it('pull_request context が無ければ空配列を返す（gh を呼ばない）', () => {
    const execImpl = vi.fn();
    expect(fetchPrFilenames({ execImpl })).toEqual([]);
    expect(execImpl).not.toHaveBeenCalled();
  });

  it('gh api の出力を改行区切りで配列化する', () => {
    const execImpl = vi.fn(() => 'apps/product/src/foo.ts\napps/web/src/bar.ts\n');
    const files = fetchPrFilenames({ repo: 'Dayopt/dayopt', prNumber: 42, execImpl });
    expect(files).toEqual(['apps/product/src/foo.ts', 'apps/web/src/bar.ts']);
    expect(execImpl).toHaveBeenCalledWith(
      'gh',
      expect.arrayContaining(['api', '--paginate', 'repos/Dayopt/dayopt/pulls/42/files']),
      expect.anything(),
    );
  });
});

describe('fetchPrFilesWithStatus', () => {
  it('pull_request context が無ければ空配列を返す', () => {
    const execImpl = vi.fn();
    expect(fetchPrFilesWithStatus({ execImpl })).toEqual([]);
  });

  it('NDJSON を 1 行ずつ JSON.parse して配列化し、壊れた行はスキップする', () => {
    const execImpl = vi.fn(
      () =>
        '{"filename":"supabase/migrations/x.sql","status":"added"}\nnot-json\n{"filename":"a.ts","status":"modified"}\n',
    );
    const files = fetchPrFilesWithStatus({ repo: 'Dayopt/dayopt', prNumber: 1, execImpl });
    expect(files).toEqual([
      { filename: 'supabase/migrations/x.sql', status: 'added' },
      { filename: 'a.ts', status: 'modified' },
    ]);
  });
});

describe('runMigrationSafety', () => {
  const fetchOk = (entries: { filename: string; status: string }[]) => vi.fn(() => entries);
  const noopSpawn = () => ({ status: 0 });

  it('destructive な変更が無ければ通知せず終了する', async () => {
    const execFileImpl = vi.fn();
    const spawnImpl = vi.fn(noopSpawn);
    const writeStepSummaryImpl = vi.fn(async () => {});
    const result = await runMigrationSafety({
      repo: 'Dayopt/dayopt',
      prNumber: 1,
      fetchFilesImpl: fetchOk([]),
      execFileImpl,
      spawnImpl,
      writeStepSummaryImpl,
    });
    expect(result.notified).toBe(false);
    expect(spawnImpl).not.toHaveBeenCalled();
    expect(writeStepSummaryImpl).toHaveBeenCalledOnce();
  });

  it('destructive な変更を検知したら comment 投稿→ラベル付与の順で通知する', async () => {
    const readFileImpl = vi.fn(() => 'DROP TABLE foo;');
    const execFileImpl = vi.fn(() => 'false'); // has_label=false
    const calls: string[][] = [];
    const spawnImpl = vi.fn((_cmd: string, args: string[]) => {
      calls.push(args);
      return { status: 0 };
    });
    const result = await runMigrationSafety({
      repo: 'Dayopt/dayopt',
      prNumber: 7,
      fetchFilesImpl: fetchOk([
        { filename: 'supabase/migrations/20260101_x.sql', status: 'added' },
      ]),
      readFileImpl,
      execFileImpl,
      spawnImpl,
      writeStepSummaryImpl: vi.fn(async () => {}),
    });
    expect(result.notified).toBe(true);
    expect(result.results).toHaveLength(1);
    // label create → comment → label 付与の順で呼ばれる
    expect(calls[0]).toEqual(expect.arrayContaining(['label', 'create']));
    expect(calls[1]).toEqual(expect.arrayContaining(['pr', 'comment']));
    expect(calls[2]).toEqual(expect.arrayContaining(['api', '--method', 'POST']));
  });

  it('既にラベルが付いていれば round ごとに再通知しない', async () => {
    const execFileImpl = vi.fn(() => 'true'); // has_label=true
    const spawnImpl = vi.fn(noopSpawn);
    const result = await runMigrationSafety({
      repo: 'Dayopt/dayopt',
      prNumber: 7,
      fetchFilesImpl: fetchOk([
        { filename: 'supabase/migrations/20260101_x.sql', status: 'added' },
      ]),
      readFileImpl: vi.fn(() => 'DROP TABLE foo;'),
      execFileImpl,
      spawnImpl,
      writeStepSummaryImpl: vi.fn(async () => {}),
    });
    expect(result.notified).toBe(false);
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('ラベル存在確認の gh api が失敗しても fail open で通知を試みる', async () => {
    const execFileImpl = vi.fn(() => {
      throw new Error('gh api rate limited');
    });
    const calls: string[][] = [];
    const spawnImpl = vi.fn((_cmd: string, args: string[]) => {
      calls.push(args);
      return { status: 0 };
    });
    const result = await runMigrationSafety({
      repo: 'Dayopt/dayopt',
      prNumber: 7,
      fetchFilesImpl: fetchOk([
        { filename: 'supabase/migrations/20260101_x.sql', status: 'added' },
      ]),
      readFileImpl: vi.fn(() => 'TRUNCATE foo;'),
      execFileImpl,
      spawnImpl,
      writeStepSummaryImpl: vi.fn(async () => {}),
    });
    expect(result.notified).toBe(true);
    expect(calls.some((c) => c.includes('comment'))).toBe(true);
  });

  it('コメント投稿が失敗（fork PR の read-only token 等）したらラベルは付与しない', async () => {
    const execFileImpl = vi.fn(() => 'false');
    const spawnImpl = vi.fn((_cmd: string, args: string[]) =>
      args.includes('comment') ? { status: 1 } : { status: 0 },
    );
    const result = await runMigrationSafety({
      repo: 'Dayopt/dayopt',
      prNumber: 7,
      fetchFilesImpl: fetchOk([
        { filename: 'supabase/migrations/20260101_x.sql', status: 'added' },
      ]),
      readFileImpl: vi.fn(() => 'DROP TABLE foo;'),
      execFileImpl,
      spawnImpl,
      writeStepSummaryImpl: vi.fn(async () => {}),
    });
    expect(result.notified).toBe(false);
    // label create は行うが、POST（ラベル付与）は行わない
    const postCalls = spawnImpl.mock.calls.filter(
      (c) => Array.isArray(c[1]) && (c[1] as string[]).includes('POST'),
    );
    expect(postCalls).toHaveLength(0);
  });

  it('読めないファイル（削除・rename）は空文字として扱い例外を投げない', async () => {
    const readFileImpl = vi.fn(() => {
      throw new Error('ENOENT');
    });
    const result = await runMigrationSafety({
      repo: 'Dayopt/dayopt',
      prNumber: 7,
      fetchFilesImpl: fetchOk([{ filename: 'supabase/migrations/removed.sql', status: 'removed' }]),
      readFileImpl,
      execFileImpl: vi.fn(),
      spawnImpl: vi.fn(noopSpawn),
      writeStepSummaryImpl: vi.fn(async () => {}),
    });
    expect(result.notified).toBe(false);
    expect(result.results).toEqual([]);
  });
});
