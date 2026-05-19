import { describe, expect, it } from 'vitest';

import { cn } from './utils';

describe('utils', () => {
  describe('cn', () => {
    it('クラス名を結合する', () => {
      const result = cn('foo', 'bar');
      expect(result).toBe('foo bar');
    });

    it('条件付きクラス名を処理する', () => {
      const result = cn('foo', { bar: true, baz: false });
      expect(result).toBe('foo bar');
    });

    it('Tailwind CSS競合を解決する', () => {
      const result = cn('px-2', 'px-4');
      expect(result).toBe('px-4');
    });

    it('undefinedとnullを無視する', () => {
      const result = cn('foo', undefined, null, 'bar');
      expect(result).toBe('foo bar');
    });

    it('空の入力で空文字を返す', () => {
      const result = cn();
      expect(result).toBe('');
    });

    it('配列入力を処理する', () => {
      const result = cn(['foo', 'bar'], 'baz');
      expect(result).toBe('foo bar baz');
    });

    it('複雑な条件を処理する', () => {
      const isActive = true;
      const isDisabled = false;
      const result = cn(
        'base-class',
        {
          'active-class': isActive,
          'disabled-class': isDisabled,
        },
        'another-class',
      );
      expect(result).toBe('base-class active-class another-class');
    });
  });
});
