import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  classifyLinkViolations,
  shouldSkipLinkTarget,
  stripCodeSpans,
  type LinkViolation,
} from '../checks/link-check.ts';
import { KNOWN_FROZEN_BROKEN_LINKS, ROOT } from '../config.ts';

function violation(source: string, target: string): LinkViolation {
  return { file: resolve(ROOT, source), target };
}

const [firstKnown] = KNOWN_FROZEN_BROKEN_LINKS;

describe('shouldSkipLinkTarget', () => {
  it('外部URL・アンカー・Storybook deep-linkをスキップする', () => {
    expect(shouldSkipLinkTarget('https://example.com')).toBe(true);
    expect(shouldSkipLinkTarget('http://example.com')).toBe(true);
    expect(shouldSkipLinkTarget('mailto:a@example.com')).toBe(true);
    expect(shouldSkipLinkTarget('#section')).toBe(true);
    expect(shouldSkipLinkTarget('?path=/docs/foo')).toBe(true);
  });

  it('root相対リンクはスキップしない', () => {
    // GitHub 上でも公開サイトでも repo path として解決しないので、書かれていたら報告する。
    // 実リンクとして書かれた例は docs/ 全体で 0 件（唯一の出現はコード例で、stripCodeSpans が除く）。
    expect(shouldSkipLinkTarget('/docs/faq/features')).toBe(false);
    expect(shouldSkipLinkTarget('/docs/foo.md')).toBe(false);
  });

  it('相対pathはスキップしない', () => {
    expect(shouldSkipLinkTarget('./sibling.md')).toBe(false);
    expect(shouldSkipLinkTarget('../parent.md')).toBe(false);
    expect(shouldSkipLinkTarget('nested/child.md')).toBe(false);
  });
});

describe('stripCodeSpans', () => {
  it('inline code span内のリンク記法を除去する', () => {
    const content = 'index を `## [機能](/docs/faq/features)` の形で書いたところ壊れた。';

    expect(stripCodeSpans(content)).not.toContain('/docs/faq/features');
  });

  it('code fence内のリンク記法を除去する', () => {
    const content = ['前文', '```markdown', '[例](../does-not-exist.md)', '```', '後文'].join('\n');

    const stripped = stripCodeSpans(content);

    expect(stripped).not.toContain('does-not-exist.md');
    expect(stripped).toContain('前文');
    expect(stripped).toContain('後文');
  });

  it('~~~ fenceも除去する', () => {
    const content = ['~~~', '[例](../gone.md)', '~~~'].join('\n');

    expect(stripCodeSpans(content)).not.toContain('gone.md');
  });

  it('code span外の実リンクは残す', () => {
    const content = '`config.ts` の [設定](../conventions.md) を見る。';

    const stripped = stripCodeSpans(content);

    expect(stripped).toContain('../conventions.md');
    expect(stripped).not.toContain('config.ts');
  });

  it('同一行に複数のcode spanがあっても間のリンクを残す', () => {
    const content = '`a` と [link](../x.md) と `b`';

    expect(stripCodeSpans(content)).toContain('../x.md');
  });

  it('閉じないbacktickでは何も除去しない', () => {
    const content = 'backtick ` ひとつだけ [link](../y.md)';

    expect(stripCodeSpans(content)).toContain('../y.md');
  });
});

describe('classifyLinkViolations', () => {
  it('stock側のリンク切れをfatalに分類する', () => {
    const violations = [violation('docs/product/principles.md', './missing.md')];

    const { fatal, knownFrozen, unregisteredFrozen } = classifyLinkViolations(violations);

    expect(fatal).toHaveLength(1);
    expect(knownFrozen).toHaveLength(0);
    expect(unregisteredFrozen).toHaveLength(0);
  });

  it('除外リスト登録済みの凍結リンク切れをknownFrozenに分類する', () => {
    if (firstKnown === undefined) throw new Error('KNOWN_FROZEN_BROKEN_LINKS が空');
    const violations = [violation(firstKnown.source, firstKnown.target)];

    const { fatal, knownFrozen, unregisteredFrozen } = classifyLinkViolations(violations);

    expect(fatal).toHaveLength(0);
    expect(knownFrozen).toHaveLength(1);
    expect(unregisteredFrozen).toHaveLength(0);
  });

  it('除外リストに無い凍結リンク切れをunregisteredFrozenに分類する', () => {
    const violations = [
      violation('docs/product/log/2026-06-16-feature-non-adoption.md', '../x.md'),
    ];

    const { fatal, knownFrozen, unregisteredFrozen } = classifyLinkViolations(violations);

    expect(fatal).toHaveLength(0);
    expect(knownFrozen).toHaveLength(0);
    expect(unregisteredFrozen).toHaveLength(1);
  });

  it('sourceが一致してもtargetが違えば未登録として扱う', () => {
    if (firstKnown === undefined) throw new Error('KNOWN_FROZEN_BROKEN_LINKS が空');
    const violations = [violation(firstKnown.source, `${firstKnown.target}.other`)];

    const { knownFrozen, unregisteredFrozen } = classifyLinkViolations(violations);

    expect(knownFrozen).toHaveLength(0);
    expect(unregisteredFrozen).toHaveLength(1);
  });

  it('同一ペアが複数箇所に出ても全てknownFrozenに数える', () => {
    if (firstKnown === undefined) throw new Error('KNOWN_FROZEN_BROKEN_LINKS が空');
    // 除外リストはペア単位、violations は出現箇所単位。件数がずれるのは仕様。
    const violations = [
      violation(firstKnown.source, firstKnown.target),
      violation(firstKnown.source, firstKnown.target),
    ];

    const { knownFrozen, unregisteredFrozen, staleAllowlistEntries } =
      classifyLinkViolations(violations);

    expect(knownFrozen).toHaveLength(2);
    expect(unregisteredFrozen).toHaveLength(0);
    expect(staleAllowlistEntries).not.toContainEqual(firstKnown);
  });

  it('anchor付きtargetは除外リストのanchor無しエントリと一致しない', () => {
    if (firstKnown === undefined) throw new Error('KNOWN_FROZEN_BROKEN_LINKS が空');
    // 存在確認は anchor を除いた path で行うが、一致判定は raw 文字列。この非対称のため
    // 除外リストへ anchor 付きを足す時は log 本文の raw をそのままコピーする必要がある。
    const violations = [violation(firstKnown.source, `${firstKnown.target}#section`)];

    const { knownFrozen, unregisteredFrozen } = classifyLinkViolations(violations);

    expect(knownFrozen).toHaveLength(0);
    expect(unregisteredFrozen).toHaveLength(1);
  });

  it('現在解決する除外リストのエントリをstaleとして報告する', () => {
    const { staleAllowlistEntries } = classifyLinkViolations([]);

    // 違反ゼロなら全エントリが stale。除外リストが空になったら掃除する合図。
    expect(staleAllowlistEntries).toHaveLength(KNOWN_FROZEN_BROKEN_LINKS.length);
  });
});

// 除外リストが実際の docs/ と一致しているかは docs-guard の warning が毎 PR で報告する。
// unit test では fatal にしない（凍結 log のリンク切れを CI 落ちにしない設計を保つ）。
describe('KNOWN_FROZEN_BROKEN_LINKS', () => {
  it('重複エントリを持たない', () => {
    const keys = KNOWN_FROZEN_BROKEN_LINKS.map((k) => `${k.source} ${k.target}`);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
