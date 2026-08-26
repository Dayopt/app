import { describe, expect, it, vi } from 'vitest';

import {
  isBranchUpdate,
  parseRefUpdates,
  refHasTrackedDiff,
  shouldSkipDoConfirm,
} from './pre-push-diff.mjs';

const ZERO = '0000000000000000000000000000000000000000';

describe('parseRefUpdates', () => {
  it('git pre-push hook の stdin 形式を1行ずつパースする', () => {
    expect(
      parseRefUpdates(
        'refs/heads/foo sha1 refs/heads/foo remoteSha1\nrefs/heads/bar sha2 refs/heads/bar remoteSha2\n',
      ),
    ).toEqual([
      {
        localRef: 'refs/heads/foo',
        localSha: 'sha1',
        remoteRef: 'refs/heads/foo',
        remoteSha: 'remoteSha1',
      },
      {
        localRef: 'refs/heads/bar',
        localSha: 'sha2',
        remoteRef: 'refs/heads/bar',
        remoteSha: 'remoteSha2',
      },
    ]);
  });

  it('空行・前後の空白を無視する', () => {
    expect(parseRefUpdates('\n  refs/heads/foo sha1 refs/heads/foo remoteSha1  \n\n')).toEqual([
      {
        localRef: 'refs/heads/foo',
        localSha: 'sha1',
        remoteRef: 'refs/heads/foo',
        remoteSha: 'remoteSha1',
      },
    ]);
  });

  it('入力が空文字なら空配列', () => {
    expect(parseRefUpdates('')).toEqual([]);
  });
});

describe('isBranchUpdate', () => {
  it('branch 更新（非ZERO local sha + refs/heads/*）は true', () => {
    expect(isBranchUpdate({ localSha: 'abc123', remoteRef: 'refs/heads/main' })).toBe(true);
  });

  it('branch 削除（local sha が ZERO）は false', () => {
    expect(isBranchUpdate({ localSha: ZERO, remoteRef: 'refs/heads/main' })).toBe(false);
  });

  it('tag push は false', () => {
    expect(isBranchUpdate({ localSha: 'abc123', remoteRef: 'refs/tags/v1.0.0' })).toBe(false);
  });
});

describe('refHasTrackedDiff', () => {
  it('remoteSha が非ZERO で全commitが空なら false（差分なし）', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      if (args[0] === 'rev-list') return 'c1\nc2\n';
      if (args[0] === 'diff') return ''; // exit 0 (差分なし)
      throw new Error(`unexpected git call: ${args.join(' ')}`);
    });
    expect(refHasTrackedDiff({ localSha: 'local', remoteSha: 'remote' }, { execFileImpl })).toBe(
      false,
    );
  });

  it('1件でも差分のあるcommitがあれば true（複数commit中の1件でも検出する）', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      if (args[0] === 'rev-list') return 'c1\nc2\nc3\n';
      if (args[0] === 'diff') {
        if (args[3] === 'c2') throw new Error('exit 1: has diff');
        return '';
      }
      throw new Error(`unexpected git call: ${args.join(' ')}`);
    });
    expect(refHasTrackedDiff({ localSha: 'local', remoteSha: 'remote' }, { execFileImpl })).toBe(
      true,
    );
  });

  // plan-review 指摘（plan-critic）: range全体のnet diffで判定すると、
  // 追加→削除で打ち消し合うcommit列が「差分なし」に誤判定される。
  // per-commit判定ならこのケースを正しく拾う。
  it('range全体では打ち消し合っても、個別commitに差分があれば true', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      if (args[0] === 'rev-list') return 'c-add\nc-remove\n';
      if (args[0] === 'diff') {
        // c-add と c-remove はそれぞれ単体では差分を持つ（ファイル追加→削除）
        throw new Error('exit 1: has diff');
      }
      throw new Error(`unexpected git call: ${args.join(' ')}`);
    });
    expect(refHasTrackedDiff({ localSha: 'local', remoteSha: 'remote' }, { execFileImpl })).toBe(
      true,
    );
  });

  it('remoteSha が ZERO なら origin/main を base として解決する', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      if (args[0] === 'rev-parse') return 'origin-main-sha\n';
      if (args[0] === 'rev-list') {
        expect(args[1]).toBe('origin-main-sha..local');
        return 'c1\n';
      }
      if (args[0] === 'diff') return '';
      throw new Error(`unexpected git call: ${args.join(' ')}`);
    });
    expect(refHasTrackedDiff({ localSha: 'local', remoteSha: ZERO }, { execFileImpl })).toBe(false);
  });

  it('origin/main が解決できなければ true（安全側、skipしない）', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      if (args[0] === 'rev-parse') throw new Error('unknown revision');
      throw new Error('should not reach here');
    });
    expect(refHasTrackedDiff({ localSha: 'local', remoteSha: ZERO }, { execFileImpl })).toBe(true);
  });

  it('rev-list 自体が失敗すれば true（安全側）', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      if (args[0] === 'rev-list') throw new Error('bad revision range');
      throw new Error('should not reach here');
    });
    expect(refHasTrackedDiff({ localSha: 'local', remoteSha: 'remote' }, { execFileImpl })).toBe(
      true,
    );
  });

  it('commit一覧が空なら true（想定外の状態を安全側に倒す）', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      if (args[0] === 'rev-list') return '';
      throw new Error('should not reach here');
    });
    expect(refHasTrackedDiff({ localSha: 'local', remoteSha: 'remote' }, { execFileImpl })).toBe(
      true,
    );
  });

  it('root commit（親が無い）で diff --quiet が失敗すれば true（安全側）', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      if (args[0] === 'rev-list') return 'root-commit\n';
      if (args[0] === 'diff') throw new Error('unknown revision root-commit^');
      throw new Error('should not reach here');
    });
    expect(refHasTrackedDiff({ localSha: 'local', remoteSha: 'remote' }, { execFileImpl })).toBe(
      true,
    );
  });

  it('git diff がタイムアウト設定を渡される（hang対策）', () => {
    const execFileImpl = vi.fn((_file: string, _args: string[], options?: { timeout?: number }) => {
      expect(options?.timeout).toBeGreaterThan(0);
      if (_args[0] === 'rev-list') return 'c1\n';
      return '';
    });
    refHasTrackedDiff({ localSha: 'local', remoteSha: 'remote' }, { execFileImpl });
  });
});

describe('shouldSkipDoConfirm', () => {
  it('branch update が無ければ false', () => {
    expect(
      shouldSkipDoConfirm([
        { localRef: 'refs/tags/v1', localSha: 'x', remoteRef: 'refs/tags/v1', remoteSha: ZERO },
      ]),
    ).toBe(false);
  });

  it('全refが差分なしなら true（skip）', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      if (args[0] === 'rev-list') return 'c1\n';
      if (args[0] === 'diff') return '';
      throw new Error('unexpected');
    });
    const refUpdates = [
      { localRef: 'refs/heads/a', localSha: 'la', remoteRef: 'refs/heads/a', remoteSha: 'ra' },
    ];
    expect(shouldSkipDoConfirm(refUpdates, { execFileImpl })).toBe(true);
  });

  it('複数refのうち1つでも差分があれば false（混在pushはskipしない）', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      if (args[0] === 'rev-list') {
        return args[1].startsWith('ra..') ? 'c1\n' : 'c2\n';
      }
      if (args[0] === 'diff') {
        // b branch (rb..) 側の commit c2 に差分あり
        if (args[3] === 'c2') throw new Error('has diff');
        return '';
      }
      throw new Error('unexpected');
    });
    const refUpdates = [
      { localRef: 'refs/heads/a', localSha: 'la', remoteRef: 'refs/heads/a', remoteSha: 'ra' },
      { localRef: 'refs/heads/b', localSha: 'lb', remoteRef: 'refs/heads/b', remoteSha: 'rb' },
    ];
    expect(shouldSkipDoConfirm(refUpdates, { execFileImpl })).toBe(false);
  });

  it('単一refの中に空コミット+差分コミットが混在していれば false', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      if (args[0] === 'rev-list') return 'empty-commit\nreal-change-commit\n';
      if (args[0] === 'diff') {
        if (args[3] === 'real-change-commit') throw new Error('has diff');
        return '';
      }
      throw new Error('unexpected');
    });
    const refUpdates = [
      { localRef: 'refs/heads/a', localSha: 'la', remoteRef: 'refs/heads/a', remoteSha: 'ra' },
    ];
    expect(shouldSkipDoConfirm(refUpdates, { execFileImpl })).toBe(false);
  });
});
