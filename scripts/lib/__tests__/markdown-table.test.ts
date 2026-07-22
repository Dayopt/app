import { describe, expect, it } from 'vitest';

import { escapeMarkdownTableCell } from '../markdown-table';

describe('escapeMarkdownTableCell', () => {
  it('pipe を Markdown の列区切りとして解釈されない形にする', () => {
    expect(escapeMarkdownTableCell('a|b')).toBe(String.raw`a\|b`);
    expect(escapeMarkdownTableCell('a|b|c')).toBe(String.raw`a\|b\|c`);
  });

  it('既存の backslash を保持したまま後続の pipe を escape する', () => {
    expect(escapeMarkdownTableCell(String.raw`a\|b`)).toBe(String.raw`a\\\|b`);
    expect(escapeMarkdownTableCell(String.raw`a\\|b`)).toBe(String.raw`a\\\\\|b`);
  });

  it('末尾の backslash を保持する', () => {
    expect(escapeMarkdownTableCell('path\\')).toBe('path\\\\');
  });

  it('空白を正規化し、空なら em dash を返す', () => {
    expect(escapeMarkdownTableCell('  hello\n\tworld  ')).toBe('hello world');
    expect(escapeMarkdownTableCell(' \n\t ')).toBe('—');
  });
});
