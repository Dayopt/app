import { describe, expect, it } from 'vitest';

import { extractTagSuffixes, partitionByExistingName } from '../tag-ungroup';

describe('extractTagSuffixes', () => {
  it('コロンあり → suffix を抽出', () => {
    const result = extractTagSuffixes([{ name: 'Work:api' }, { name: 'Work:web' }]);
    expect(result.map((r) => r.suffix)).toEqual(['api', 'web']);
  });

  it('コロンなし → タグ名全体を suffix とする', () => {
    const result = extractTagSuffixes([{ name: 'Solo' }]);
    expect(result[0]?.suffix).toBe('Solo');
  });

  it('コロン複数 → 最初のコロン以降が suffix', () => {
    const result = extractTagSuffixes([{ name: 'a:b:c' }]);
    expect(result[0]?.suffix).toBe('b:c');
  });

  it('元の tag オブジェクトを保持する', () => {
    const tag = { name: 'Work:api', id: 'tag-1' };
    const result = extractTagSuffixes([tag]);
    expect(result[0]?.tag).toBe(tag);
  });

  it('空配列 → 空配列', () => {
    expect(extractTagSuffixes([])).toEqual([]);
  });
});

describe('partitionByExistingName', () => {
  it('衝突あり / なしを分類する', () => {
    const entries = [
      { tag: { name: 'Work:api' }, suffix: 'api' },
      { tag: { name: 'Work:web' }, suffix: 'web' },
      { tag: { name: 'Work:db' }, suffix: 'db' },
    ];
    const existing = new Map([
      ['api', { id: 'existing-api' }],
      ['db', { id: 'existing-db' }],
    ]);
    const { conflicts, nonConflicts } = partitionByExistingName(entries, existing);
    expect(conflicts.map((c) => c.suffix)).toEqual(['api', 'db']);
    expect(nonConflicts.map((c) => c.suffix)).toEqual(['web']);
  });

  it('全て衝突 → nonConflicts 空', () => {
    const entries = [{ tag: { name: 'Work:api' }, suffix: 'api' }];
    const existing = new Map([['api', { id: 'x' }]]);
    const { conflicts, nonConflicts } = partitionByExistingName(entries, existing);
    expect(conflicts).toHaveLength(1);
    expect(nonConflicts).toHaveLength(0);
  });

  it('衝突なし → conflicts 空', () => {
    const entries = [{ tag: { name: 'Work:api' }, suffix: 'api' }];
    const existing = new Map<string, unknown>();
    const { conflicts, nonConflicts } = partitionByExistingName(entries, existing);
    expect(conflicts).toHaveLength(0);
    expect(nonConflicts).toHaveLength(1);
  });

  it('空配列入力 → 双方空', () => {
    const { conflicts, nonConflicts } = partitionByExistingName([], new Map());
    expect(conflicts).toEqual([]);
    expect(nonConflicts).toEqual([]);
  });

  it('Set でも動作する（has を持つオブジェクトを受け取る）', () => {
    const entries = [
      { tag: { name: 'Work:api' }, suffix: 'api' },
      { tag: { name: 'Work:web' }, suffix: 'web' },
    ];
    const existing = new Set(['api']);
    const { conflicts, nonConflicts } = partitionByExistingName(entries, existing);
    expect(conflicts.map((c) => c.suffix)).toEqual(['api']);
    expect(nonConflicts.map((c) => c.suffix)).toEqual(['web']);
  });
});
