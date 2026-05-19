import { describe, expect, it } from 'vitest';
import { calculateReadingTime } from '../utils';

describe('calculateReadingTime', () => {
  it('英語テキストは単語数ベースで計算（200 wpm）', () => {
    const words = Array(200).fill('word').join(' '); // 200 words
    expect(calculateReadingTime(words)).toBe(1);
  });

  it('英語テキスト: 400単語 → 2分', () => {
    const words = Array(400).fill('word').join(' ');
    expect(calculateReadingTime(words)).toBe(2);
  });

  it('日本語テキストは文字数ベースで計算（500 cpm）', () => {
    const chars = 'あ'.repeat(500);
    expect(calculateReadingTime(chars)).toBe(1);
  });

  it('日本語テキスト: 1000文字 → 2分', () => {
    const chars = 'あ'.repeat(1000);
    expect(calculateReadingTime(chars)).toBe(2);
  });

  it('最小値は1分', () => {
    expect(calculateReadingTime('hello')).toBe(1);
    expect(calculateReadingTime('あ')).toBe(1);
  });

  it('空文字列でも1分を返す', () => {
    expect(calculateReadingTime('')).toBe(1);
  });

  it('カスタムwpmを指定できる', () => {
    const words = Array(100).fill('word').join(' ');
    expect(calculateReadingTime(words, { wordsPerMinute: 100 })).toBe(1);
  });

  it('カスタムcpmを指定できる', () => {
    const chars = 'あ'.repeat(250);
    expect(calculateReadingTime(chars, { charsPerMinute: 250 })).toBe(1);
  });
});
