import { describe, expect, it, vi } from 'vitest';

import {
  fetchDecisionEntries,
  mergeDecisionsMd,
  sanitizeCell,
} from '../gardening/sync-decisions.mjs';

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

// push前反証レビュー指摘（P1、PR #2445）: 個別判定を観測完了時点で
// `judgment:diverged` から `judgment:judged` へ付け替える設計にしたため、
// 月次 sync は両ラベルを検索しないと、日次で付け替え済みの分岐が
// docs/decisions.md へ永久に載らなくなる（不可逆）。
describe('fetchDecisionEntries', () => {
  it('judgment:diverged と judgment:judged の両方を検索する', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      const labelIdx = args.indexOf('--label');
      const label = args[labelIdx + 1];
      if (label === 'judgment:diverged') {
        return JSON.stringify([
          { number: 1, title: 'diverged only', url: 'u1', updatedAt: '2026-01-01T00:00:00Z' },
        ]);
      }
      if (label === 'judgment:judged') {
        return JSON.stringify([
          { number: 2, title: 'judged, sync待ち', url: 'u2', updatedAt: '2026-08-01T00:00:00Z' },
        ]);
      }
      throw new Error(`unexpected label: ${label}`);
    });
    const entries = fetchDecisionEntries('Dayopt/dayopt', { execFileImpl });
    expect(entries.map((e) => e.number).sort()).toEqual([1, 2]);
  });

  it('同一issueが両ラベル検索に出ても重複させない', () => {
    const execFileImpl = vi.fn(() =>
      JSON.stringify([{ number: 5, title: 'x', url: 'u5', updatedAt: '2026-01-01T00:00:00Z' }]),
    );
    const entries = fetchDecisionEntries('Dayopt/dayopt', { execFileImpl });
    expect(entries).toHaveLength(1);
  });
});
