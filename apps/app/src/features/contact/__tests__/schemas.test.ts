/**
 * Contact Schemas Unit Tests
 */

import { describe, expect, it } from 'vitest';

import { contactCategorySchema, contactEnvironmentSchema, contactFormSchema } from '../schemas';

describe('contactCategorySchema', () => {
  it('正常系: 有効なカテゴリを受け入れる', () => {
    expect(contactCategorySchema.parse('bug')).toBe('bug');
    expect(contactCategorySchema.parse('feature')).toBe('feature');
    expect(contactCategorySchema.parse('question')).toBe('question');
    expect(contactCategorySchema.parse('other')).toBe('other');
  });

  it('エラー系: 無効なカテゴリを拒否する', () => {
    expect(() => contactCategorySchema.parse('invalid')).toThrow();
    expect(() => contactCategorySchema.parse('')).toThrow();
  });
});

describe('contactEnvironmentSchema', () => {
  const validEnv = {
    appVersion: '0.19.0',
    os: 'macOS 15.0',
    browser: 'Chrome 120.0',
    timezone: 'Asia/Tokyo',
    language: 'ja',
  };

  it('正常系: 有効な環境情報を受け入れる', () => {
    const result = contactEnvironmentSchema.parse(validEnv);
    expect(result).toEqual(validEnv);
  });

  it('エラー系: 必須フィールドが欠けている', () => {
    const { os: _, ...missing } = validEnv;
    expect(() => contactEnvironmentSchema.parse(missing)).toThrow();
  });
});

describe('contactFormSchema', () => {
  const validEnvironment = {
    appVersion: '0.19.0',
    os: 'macOS 15.0',
    browser: 'Chrome 120.0',
    timezone: 'Asia/Tokyo',
    language: 'ja',
  };

  const validInput = {
    category: 'bug',
    message: 'This is a valid message with enough characters.',
    environment: validEnvironment,
  };

  it('正常系: 有効な入力を受け入れる', () => {
    const result = contactFormSchema.parse(validInput);
    expect(result).toEqual(validInput);
  });

  it('エラー系: メッセージが短すぎる', () => {
    expect(() => contactFormSchema.parse({ ...validInput, message: 'short' })).toThrow();
  });

  it('エラー系: メッセージが長すぎる', () => {
    expect(() => contactFormSchema.parse({ ...validInput, message: 'a'.repeat(5001) })).toThrow();
  });

  it('エッジケース: メッセージがちょうど10文字', () => {
    const result = contactFormSchema.parse({ ...validInput, message: 'a'.repeat(10) });
    expect(result.message).toHaveLength(10);
  });

  it('エッジケース: メッセージがちょうど5000文字', () => {
    const result = contactFormSchema.parse({ ...validInput, message: 'a'.repeat(5000) });
    expect(result.message).toHaveLength(5000);
  });

  it('エラー系: カテゴリが未指定', () => {
    expect(() => contactFormSchema.parse({ message: 'Valid message here.' })).toThrow();
  });
});
