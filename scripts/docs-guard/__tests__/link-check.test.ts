import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  classifyLinkViolations,
  shouldSkipLinkTarget,
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

  it('公開サイトのroot相対URLをスキップする', () => {
    // repo path ではなく apps/web のルート相対 URL。resolve するとファイルシステムの
    // root から探してしまい、必ず存在しないと判定される。
    expect(shouldSkipLinkTarget('/docs/faq/features')).toBe(true);
    expect(shouldSkipLinkTarget('/blog/ja/some-post')).toBe(true);
  });

  it('root相対でも.md終わりはrepo pathの書き間違いとして検出対象に残す', () => {
    // 公開サイトの route は拡張子を持たないので、これはサイト URL ではない。
    expect(shouldSkipLinkTarget('/docs/foo.md')).toBe(false);
    expect(shouldSkipLinkTarget('/README.md')).toBe(false);
    expect(shouldSkipLinkTarget('/apps/web/content/docs/foo.mdx')).toBe(false);
    expect(shouldSkipLinkTarget('/docs/foo.md#section')).toBe(false);
  });

  it('相対pathはスキップしない', () => {
    expect(shouldSkipLinkTarget('./sibling.md')).toBe(false);
    expect(shouldSkipLinkTarget('../parent.md')).toBe(false);
    expect(shouldSkipLinkTarget('nested/child.md')).toBe(false);
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
