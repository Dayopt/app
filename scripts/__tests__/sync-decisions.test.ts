import { describe, expect, it } from 'vitest';

import { mergeDecisionsMd, sanitizeCell } from '../gardening/sync-decisions.mjs';

describe('sanitizeCell', () => {
  it('改行を空白へ潰す', () => {
    expect(sanitizeCell('line1\nline2\r\nline3')).toBe('line1 line2 line3');
  });

  it('pipe を全角へ退避する', () => {
    expect(sanitizeCell('a | b')).toBe('a ｜ b');
  });

  it('マーカー構文の偽装を無害化する', () => {
    expect(sanitizeCell('<!-- fake marker -->')).toBe('‹!-- fake marker --›');
  });

  it('制御文字を除去する', () => {
    // eslint-disable-next-line no-control-regex -- テスト対象そのものが制御文字除去の検証
    expect(sanitizeCell(`a${String.fromCharCode(0)}b${String.fromCharCode(31)}c`)).toBe('abc');
  });

  it('上限文字数を超えたら省略記号で切る', () => {
    const long = 'x'.repeat(100);
    const result = sanitizeCell(long, 10);
    expect(result).toHaveLength(10);
    expect(result.endsWith('…')).toBe(true);
  });

  it('空文字列は (no title) にフォールバックする', () => {
    expect(sanitizeCell('   ')).toBe('(no title)');
    expect(sanitizeCell(null)).toBe('(no title)');
  });
});

describe('mergeDecisionsMd', () => {
  it('既存が空なら header 付きで新規作成する', () => {
    const result = mergeDecisionsMd('', [
      { number: 1, title: 'a', url: 'u1', updatedAt: '2026-01-01T00:00:00Z' },
    ]);
    expect(result).toContain('# 決定ログ（append-only）');
    expect(result).toContain('(#1)');
  });

  it('既存の行は削除・変更せず、新規分だけ追記する（append-only）', () => {
    const existing = '# 決定ログ（append-only）\n\n- 2026-01-01: old (#1) u1\n';
    const result = mergeDecisionsMd(existing, [
      { number: 1, title: 'old', url: 'u1', updatedAt: '2026-01-01T00:00:00Z' },
      { number: 2, title: 'new', url: 'u2', updatedAt: '2026-08-01T00:00:00Z' },
    ]);
    // 既存行は一字一句変わらない
    expect(result).toContain('- 2026-01-01: old (#1) u1\n');
    // 新規分は追記される
    expect(result).toContain('(#2)');
    // #1 は既出なので重複追記されない
    expect(result.match(/\(#1\)/g)).toHaveLength(1);
  });

  it('追記すべき新規エントリが無ければ既存内容をそのまま返す', () => {
    const existing = '# 決定ログ（append-only）\n\n- 2026-01-01: old (#1) u1\n';
    const result = mergeDecisionsMd(existing, [
      { number: 1, title: 'old', url: 'u1', updatedAt: '2026-01-01T00:00:00Z' },
    ]);
    expect(result).toBe(existing);
  });

  it('更新日時の古い順に追記する', () => {
    const result = mergeDecisionsMd('', [
      { number: 2, title: 'newer', url: 'u2', updatedAt: '2026-08-01T00:00:00Z' },
      { number: 1, title: 'older', url: 'u1', updatedAt: '2026-01-01T00:00:00Z' },
    ]);
    expect(result.indexOf('(#1)')).toBeLessThan(result.indexOf('(#2)'));
  });
});
