import { describe, expect, it } from 'vitest';

import { calculateReadingTime } from './reading-time';

describe('calculateReadingTime', () => {
  it('英語テキストは単語数ベースで計算する', () => {
    expect(calculateReadingTime(Array(200).fill('word').join(' '))).toBe(1);
    expect(calculateReadingTime(Array(400).fill('word').join(' '))).toBe(2);
  });

  it('日本語テキストは文字数ベースで計算する', () => {
    expect(calculateReadingTime('あ'.repeat(500))).toBe(1);
    expect(calculateReadingTime('あ'.repeat(1000))).toBe(2);
  });

  it('空文字列を含め最小値は1分', () => {
    expect(calculateReadingTime('')).toBe(1);
    expect(calculateReadingTime('hello')).toBe(1);
    expect(calculateReadingTime('あ')).toBe(1);
  });

  it('言語別の速度を上書きできる', () => {
    expect(calculateReadingTime(Array(200).fill('word').join(' '), { wordsPerMinute: 100 })).toBe(
      2,
    );
    expect(calculateReadingTime('あ'.repeat(500), { charsPerMinute: 250 })).toBe(2);
  });
});
