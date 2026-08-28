import { describe, expect, it } from 'vitest';

import {
  ALLOW_MARKER,
  FORBIDDEN_PATTERNS,
  findRuleViolations,
  isExcludedPath,
  ruleMatchesLine,
  type ForbiddenPattern,
} from '../lib/check-tokens-core';

/**
 * check-tokens の判定コアのテスト。
 *
 * grep（CLI 側）は候補ファイルの発見にしか使われず、行の採否は
 * check-tokens-core.ts の pure function が決める。ここでは本番と同じ
 * 判定関数を文字列 fixture で直接叩く。lookaround 入りルールが ERE
 * 非対応で無言で壊れていた前科があるため、パターン自体の妥当性
 * （JS RegExp として解釈可能か）もここで固定する。
 */

function ruleByMessage(fragment: string): ForbiddenPattern {
  const rule = FORBIDDEN_PATTERNS.find((r) => r.message.includes(fragment));
  if (!rule) throw new Error(`ルールが見つかりません: ${fragment}`);
  return rule;
}

const bareRounded = ruleByMessage('bare rounded');
const arbitraryRadius = ruleByMessage('角丸の任意値');
const fontWeight = ruleByMessage('禁止フォントウェイト');

describe('パターン定義の健全性', () => {
  it('全パターンが JS RegExp として解釈できる（ERE 互換の範囲で書く前提）', () => {
    for (const rule of FORBIDDEN_PATTERNS) {
      expect(() => new RegExp(rule.pattern)).not.toThrow();
      if (rule.excludePattern) {
        expect(() => new RegExp(rule.excludePattern as string)).not.toThrow();
      }
    }
  });

  it('lookahead / lookbehind を含まない（grep -E が解釈できない）', () => {
    for (const rule of FORBIDDEN_PATTERNS) {
      expect(rule.pattern).not.toMatch(/\(\?/);
    }
  });
});

describe('bare rounded ルール', () => {
  it('camelCase 識別子（roundedStart / roundedMinutes）にはマッチしない', () => {
    expect(ruleMatchesLine(bareRounded, '  const diff = roundedStart.getTime();')).toBe(false);
    expect(ruleMatchesLine(bareRounded, '  roundedMinutes = 60;')).toBe(false);
  });

  it('クラス文字列の bare rounded にはマッチする', () => {
    expect(ruleMatchesLine(bareRounded, '<div className="rounded" />')).toBe(true);
  });

  it('rounded-lg などトークン付きにはマッチしない', () => {
    expect(ruleMatchesLine(bareRounded, '<div className="rounded-lg" />')).toBe(false);
  });
});

describe('角丸の任意値ルール', () => {
  it('rounded-[8px] にはマッチする', () => {
    expect(ruleMatchesLine(arbitraryRadius, 'className="rounded-[8px]"')).toBe(true);
  });

  it('rounded-[inherit]（pseudo-element の親 radius 継承）は除外される', () => {
    expect(ruleMatchesLine(arbitraryRadius, "'before:rounded-[inherit]',")).toBe(false);
  });
});

describe(`${ALLOW_MARKER} マーカー機構`, () => {
  it('直前行にマーカーがある違反行は除外される', () => {
    const lines = [
      '<div className="font-medium" />',
      `{/* ${ALLOW_MARKER}: 教材例 */}`,
      '<div className="font-bold" />',
      '<div className="font-bold" />',
    ];
    // 3 行目はマーカー直後なので除外、4 行目は違反のまま
    expect(findRuleViolations(fontWeight, lines)).toEqual([4]);
  });

  it('同一行にマーカーがある違反行は除外される', () => {
    const lines = [`<div className="font-bold" /> {/* ${ALLOW_MARKER}: 教材例 */}`];
    expect(findRuleViolations(fontWeight, lines)).toEqual([]);
  });

  it('マーカー行自身に禁止語（font-bold）が書かれていても違反にならない', () => {
    const lines = [`{/* ${ALLOW_MARKER}: font-bold は禁止例として下で提示する */}`];
    expect(findRuleViolations(fontWeight, lines)).toEqual([]);
  });

  it('マーカーの効力は直後の 1 行まで（2 行下には及ばない）', () => {
    const lines = [
      `{/* ${ALLOW_MARKER}: 教材例 */}`,
      '<div className="font-bold" />',
      '<div className="font-bold" />',
    ];
    expect(findRuleViolations(fontWeight, lines)).toEqual([3]);
  });
});

describe('findRuleViolations の基本挙動', () => {
  it('excludePattern に当たる行は違反にならない', () => {
    const lines = ['const rounded = snap(minutes);', 'className="rounded"'];
    expect(findRuleViolations(bareRounded, lines)).toEqual([2]);
  });

  it('行番号は 1-based で返る', () => {
    const lines = ['ok', 'className="rounded"'];
    expect(findRuleViolations(bareRounded, lines)).toEqual([2]);
  });
});

describe('isExcludedPath', () => {
  it('マーケの mocks 配下は全ルール適用外', () => {
    expect(
      isExcludedPath('apps/web/src/features/marketing/components/mocks/Foo.tsx:1:rounded'),
    ).toBe(true);
  });

  it('通常の feature パスは適用対象', () => {
    expect(isExcludedPath('apps/product/src/features/calendar/Foo.tsx:1:rounded')).toBe(false);
  });
});
