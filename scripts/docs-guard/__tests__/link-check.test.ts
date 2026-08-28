import { describe, expect, it } from 'vitest';

import { fromMarkdown } from 'mdast-util-from-markdown';

import { collectLinkTargets, shouldSkipLinkTarget } from '../checks/link-check.ts';

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
    expect(shouldSkipLinkTarget('/docs/faq/features')).toBe(false);
    expect(shouldSkipLinkTarget('/docs/foo.md')).toBe(false);
  });

  it('相対pathはスキップしない', () => {
    expect(shouldSkipLinkTarget('./sibling.md')).toBe(false);
    expect(shouldSkipLinkTarget('../parent.md')).toBe(false);
    expect(shouldSkipLinkTarget('nested/child.md')).toBe(false);
  });
});

describe('collectLinkTargets', () => {
  function targets(markdown: string): string[] {
    return collectLinkTargets(fromMarkdown(markdown));
  }

  it('code span内のリンク記法は拾わない', () => {
    expect(targets('index を `## [機能](/docs/faq/features)` の形で書いた。')).toEqual([]);
  });

  it('code fence内のリンク記法は拾わない', () => {
    expect(targets(['```markdown', '[例](../gone.md)', '```'].join('\n'))).toEqual([]);
  });

  it('~~~ fence内のリンク記法は拾わない', () => {
    expect(targets(['~~~', '[例](../gone.md)', '~~~'].join('\n'))).toEqual([]);
  });

  it('4-space indented code block内のリンク記法は拾わない', () => {
    // 手書きの fence 判定では扱えなかったクラス。
    expect(targets(['前文', '', '    [例](../gone.md)', ''].join('\n'))).toEqual([]);
  });

  it('blockquote内のcode fenceも拾わない', () => {
    expect(targets(['> ```markdown', '> [例](../gone.md)', '> ```'].join('\n'))).toEqual([]);
  });

  it('長いfence内の短いfenceで閉じない', () => {
    // ```` の中の ```markdown は終端ではないので、中身は全てコード。
    const md = ['````', '```markdown', '[例](../gone.md)', '```', '````'].join('\n');

    expect(targets(md)).toEqual([]);
  });

  it('code span外の実リンクは拾う', () => {
    expect(targets('`config.ts` の [設定](../conventions.md) を見る。')).toEqual([
      '../conventions.md',
    ]);
  });

  it('reference-styleリンクの定義を拾う', () => {
    // 正規表現では拾えていなかった形式。
    expect(targets(['[設定][ref] を見る。', '', '[ref]: ../conventions.md'].join('\n'))).toEqual([
      '../conventions.md',
    ]);
  });

  it('imageも拾う', () => {
    expect(targets('![図](../assets/diagram.png)')).toEqual(['../assets/diagram.png']);
  });

  it('table cell内のリンクを拾う', () => {
    // GFM 拡張を入れていないため table は段落として解析されるが、inline のリンクは残る。
    const md = ['| 項目 | 正本 |', '| --- | --- |', '| 規約 | [conventions](../c.md) |'].join('\n');

    expect(targets(md)).toEqual(['../c.md']);
  });

  it('括弧を含むpathの<>記法を拾う', () => {
    expect(targets('[例](<../a (b).md>)')).toEqual(['../a (b).md']);
  });
});
