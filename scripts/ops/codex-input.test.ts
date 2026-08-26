import { describe, expect, it, vi } from 'vitest';

import {
  buildCodexInput,
  buildIssueCodexInput,
  buildPrCodexInput,
  extractReferencedIssueNumbers,
  resolveReferencedIssue,
} from './codex-input.mjs';

describe('extractReferencedIssueNumbers', () => {
  it('#\\d+ 形式の参照を重複除去して抽出する', () => {
    expect(extractReferencedIssueNumbers('Depends on: #2395\n参照 #2162, #2175, #2162')).toEqual([
      2395, 2162, 2175,
    ]);
  });

  it('exclude で自己参照を除く', () => {
    expect(extractReferencedIssueNumbers('#2396 は #2395 に依存', { exclude: 2396 })).toEqual([
      2395,
    ]);
  });

  it('本文が空/undefinedでも例外を投げない', () => {
    expect(extractReferencedIssueNumbers('')).toEqual([]);
    expect(extractReferencedIssueNumbers(undefined as unknown as string)).toEqual([]);
  });
});

describe('resolveReferencedIssue', () => {
  it('取得成功時は ok:true と title/body を返す', () => {
    const execFileImpl = vi.fn(() => JSON.stringify({ title: 'T', body: 'B' }));
    expect(resolveReferencedIssue(2395, { execFileImpl })).toEqual({
      number: 2395,
      ok: true,
      title: 'T',
      body: 'B',
    });
  });

  it('取得失敗時は例外を投げず ok:false を返す', () => {
    const execFileImpl = vi.fn(() => {
      throw new Error('not found');
    });
    expect(resolveReferencedIssue(9999999, { execFileImpl })).toEqual({
      number: 9999999,
      ok: false,
    });
  });
});

describe('buildCodexInput', () => {
  it('対象本文と解決済み参照先を連結する', () => {
    const output = buildCodexInput({
      target: { title: 'Target', body: 'Target body' },
      references: [
        { number: 1, ok: true, title: 'Ref1', body: 'Ref1 body' },
        { number: 2, ok: false },
      ],
    });
    expect(output).toContain('# Target\n\nTarget body');
    expect(output).toContain('## 参照先 #1: Ref1\n\nRef1 body');
    expect(output).toContain('## 参照先 #2: 取得失敗');
  });

  // #2421 issueコメント（指揮台フィードバック）: repo内docs（設計書等）は
  // 参照解決の対象外であることをCodexへ伝える固定の注意書きを冒頭へ入れる。
  // #2396で、既にrepo内docsで裁定済みの論点をCodexが再指摘した実例がある。
  it('冒頭にrepo内docs非同梱の注意書きが入る', () => {
    const output = buildCodexInput({ target: { title: 'T', body: 'B' }, references: [] });
    expect(output.startsWith('> 注意:')).toBe(true);
    expect(output).toContain('repo 内 docs');
  });
});

describe('buildIssueCodexInput', () => {
  it('対象issueの本文から参照先issueを1段階解決して連結する', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      if (args[2] === '2396') {
        return JSON.stringify({ title: 'Epic', body: 'Depends on: #2395' });
      }
      if (args[2] === '2395') {
        return JSON.stringify({ title: 'Dep', body: 'dep body' });
      }
      throw new Error('unexpected issue number');
    });
    const output = buildIssueCodexInput(2396, { execFileImpl });
    expect(output).toContain('# Epic');
    expect(output).toContain('## 参照先 #2395: Dep\n\ndep body');
  });

  it('自己参照（#自分の番号）は解決対象から除外する', () => {
    const execFileImpl = vi.fn(() => JSON.stringify({ title: 'Self', body: '#2396 は自己参照' }));
    const output = buildIssueCodexInput(2396, { execFileImpl });
    expect(output).not.toContain('参照先 #2396');
  });

  it('未知の参照先は取得失敗として明記する（多段解決はしない）', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      if (args[2] === '2396') {
        return JSON.stringify({ title: 'Epic', body: '#9999999 参照' });
      }
      throw new Error('gh: not found');
    });
    const output = buildIssueCodexInput(2396, { execFileImpl });
    expect(output).toContain('## 参照先 #9999999: 取得失敗');
  });

  it('不正な issue 番号は例外を投げる', () => {
    expect(() => buildIssueCodexInput(-1)).toThrow(/issue番号が不正/);
    expect(() => buildIssueCodexInput(1.5)).toThrow(/issue番号が不正/);
  });
});

describe('buildPrCodexInput', () => {
  it('PR diff + 参照先を連結する', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      if (args[0] === 'pr' && args[1] === 'view') {
        return JSON.stringify({ title: 'PR', body: 'Closes #2395' });
      }
      if (args[0] === 'pr' && args[1] === 'diff') {
        return 'diff --git a/x b/x\n+added';
      }
      if (args[0] === 'issue') {
        return JSON.stringify({ title: 'Dep', body: 'dep body' });
      }
      throw new Error('unexpected call');
    });
    const output = buildPrCodexInput(2424, { execFileImpl });
    expect(output).toContain('diff --git a/x b/x');
    expect(output).toContain('## 参照先 #2395: Dep\n\ndep body');
  });

  it('参照先が無ければ注意書き + diff のみを返す（余計な参照先区切りを付けない）', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      if (args[0] === 'pr' && args[1] === 'view') {
        return JSON.stringify({ title: 'PR', body: 'no refs here' });
      }
      return 'diff --git a/x b/x\n+added';
    });
    const output = buildPrCodexInput(2424, { execFileImpl });
    expect(output).toBe(
      '> 注意: この入力は issue/PR 本文が `#\\d+` で参照する他 issue のみを1段階解決したものです。本文が指す repo 内 docs（設計書等のファイルパス）は同梱していません。そこで既に裁定済みの論点を、この入力だけを根拠に再指摘している可能性があります。\n\n---\n\ndiff --git a/x b/x\n+added',
    );
    expect(output).not.toContain('参照先');
  });

  it('冒頭にrepo内docs非同梱の注意書きが入る（参照先ありの場合も）', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      if (args[0] === 'pr' && args[1] === 'view') {
        return JSON.stringify({ title: 'PR', body: 'Closes #2395' });
      }
      if (args[0] === 'pr' && args[1] === 'diff') return 'diff --git a/x b/x';
      return JSON.stringify({ title: 'Dep', body: 'dep body' });
    });
    const output = buildPrCodexInput(2424, { execFileImpl });
    expect(output.startsWith('> 注意:')).toBe(true);
  });
});
