import { describe, expect, it } from 'vitest';
import { generateExcerpt } from '../blog';

describe('generateExcerpt', () => {
  it('Markdownヘッダーを除去', () => {
    expect(generateExcerpt('## Hello World')).toBe('Hello World');
  });

  it('太字を除去', () => {
    expect(generateExcerpt('This is **bold** text')).toBe('This is bold text');
  });

  it('イタリックを除去', () => {
    expect(generateExcerpt('This is *italic* text')).toBe('This is italic text');
  });

  it('インラインコードを除去', () => {
    expect(generateExcerpt('Use `npm install`')).toBe('Use npm install');
  });

  it('リンクをテキストのみに変換', () => {
    expect(generateExcerpt('[Click here](https://example.com)')).toBe('Click here');
  });

  it('画像を除去', () => {
    expect(generateExcerpt('![alt text](image.png) Some text')).toBe('Some text');
  });

  it('コードブロックを除去', () => {
    const input = 'Before\n```js\nconsole.log("hi")\n```\nAfter';
    expect(generateExcerpt(input)).toBe('Before After');
  });

  it('改行をスペースに変換', () => {
    expect(generateExcerpt('Line 1\nLine 2\nLine 3')).toBe('Line 1 Line 2 Line 3');
  });

  it('maxLength を超える場合は ... を付与', () => {
    const longText = 'a'.repeat(200);
    const result = generateExcerpt(longText, 160);
    expect(result.length).toBeLessThanOrEqual(163); // 160 + '...'
    expect(result.endsWith('...')).toBe(true);
  });

  it('maxLength 以下のテキストはそのまま返す', () => {
    expect(generateExcerpt('Short text', 160)).toBe('Short text');
  });

  it('空文字列は空文字列を返す', () => {
    expect(generateExcerpt('')).toBe('');
  });
});
