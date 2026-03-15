import { describe, expect, it } from 'vitest';

import {
  generateRecoveryCodes,
  hashRecoveryCode,
  isValidRecoveryCodeFormat,
  prepareCodesForStorage,
  verifyRecoveryCode,
} from './recovery-codes';

describe('recovery-codes', () => {
  describe('generateRecoveryCodes', () => {
    it('10個のコードを生成する', () => {
      const codes = generateRecoveryCodes();
      expect(codes).toHaveLength(10);
    });

    it('XXXX-XXXX 形式のコードを生成する', () => {
      const codes = generateRecoveryCodes();
      for (const code of codes) {
        expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      }
    });

    it('紛らわしい文字（I, O, 0, 1）を含まない', () => {
      const codes = generateRecoveryCodes();
      for (const code of codes) {
        expect(code).not.toMatch(/[IO01]/);
      }
    });

    it('毎回異なるコードを生成する', () => {
      const codes1 = generateRecoveryCodes();
      const codes2 = generateRecoveryCodes();
      // 全コードが一致する確率はほぼゼロ
      expect(codes1).not.toEqual(codes2);
    });
  });

  describe('hashRecoveryCode', () => {
    it('同じコードに対して同じハッシュを返す', () => {
      const hash1 = hashRecoveryCode('ABCD-EF23');
      const hash2 = hashRecoveryCode('ABCD-EF23');
      expect(hash1).toBe(hash2);
    });

    it('ハイフンの有無に関わらず同じハッシュを返す（正規化）', () => {
      const withHyphen = hashRecoveryCode('ABCD-EF23');
      const withoutHyphen = hashRecoveryCode('ABCDEF23');
      expect(withHyphen).toBe(withoutHyphen);
    });

    it('大文字小文字を区別しない（正規化）', () => {
      const upper = hashRecoveryCode('ABCD-EF23');
      const lower = hashRecoveryCode('abcd-ef23');
      expect(upper).toBe(lower);
    });

    it('異なるコードに対して異なるハッシュを返す', () => {
      const hash1 = hashRecoveryCode('ABCD-EF23');
      const hash2 = hashRecoveryCode('WXYZ-5678');
      expect(hash1).not.toBe(hash2);
    });

    it('hex文字列を返す', () => {
      const hash = hashRecoveryCode('ABCD-EF23');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('verifyRecoveryCode', () => {
    it('正しいコードで検証成功', () => {
      const code = 'ABCD-EF23';
      const hashed = hashRecoveryCode(code);
      expect(verifyRecoveryCode(code, hashed)).toBe(true);
    });

    it('ハイフンなしでも検証成功', () => {
      const code = 'ABCD-EF23';
      const hashed = hashRecoveryCode(code);
      expect(verifyRecoveryCode('ABCDEF23', hashed)).toBe(true);
    });

    it('小文字入力でも検証成功', () => {
      const code = 'ABCD-EF23';
      const hashed = hashRecoveryCode(code);
      expect(verifyRecoveryCode('abcd-ef23', hashed)).toBe(true);
    });

    it('不正なコードで検証失敗', () => {
      const hashed = hashRecoveryCode('ABCD-EF23');
      expect(verifyRecoveryCode('WXYZ-5678', hashed)).toBe(false);
    });

    it('生成したコードのラウンドトリップ検証', () => {
      const codes = generateRecoveryCodes();
      for (const code of codes) {
        const hashed = hashRecoveryCode(code);
        expect(verifyRecoveryCode(code, hashed)).toBe(true);
      }
    });
  });

  describe('isValidRecoveryCodeFormat', () => {
    it('正しいフォーマット（XXXX-XXXX）を受け入れる', () => {
      expect(isValidRecoveryCodeFormat('ABCD-EF23')).toBe(true);
    });

    it('ハイフンなしでも受け入れる', () => {
      expect(isValidRecoveryCodeFormat('ABCDEF23')).toBe(true);
    });

    it('小文字でも受け入れる', () => {
      expect(isValidRecoveryCodeFormat('abcd-ef23')).toBe(true);
    });

    it('短すぎるコードを拒否する', () => {
      expect(isValidRecoveryCodeFormat('ABC')).toBe(false);
    });

    it('長すぎるコードを拒否する', () => {
      expect(isValidRecoveryCodeFormat('ABCDEFGHJK')).toBe(false);
    });

    it('紛らわしい文字（I, O, 0, 1）を含むコードを拒否する', () => {
      expect(isValidRecoveryCodeFormat('ABCD-EI23')).toBe(false);
      expect(isValidRecoveryCodeFormat('ABCD-EO23')).toBe(false);
      expect(isValidRecoveryCodeFormat('ABCD-E023')).toBe(false);
      expect(isValidRecoveryCodeFormat('ABCD-E123')).toBe(false);
    });

    it('空文字を拒否する', () => {
      expect(isValidRecoveryCodeFormat('')).toBe(false);
    });

    it('生成されたコードは全て有効なフォーマット', () => {
      const codes = generateRecoveryCodes();
      for (const code of codes) {
        expect(isValidRecoveryCodeFormat(code)).toBe(true);
      }
    });
  });

  describe('prepareCodesForStorage', () => {
    it('ハッシュ化されたコードの配列を返す', () => {
      const codes = ['ABCD-EF23', 'WXYZ-5678'];
      const prepared = prepareCodesForStorage(codes);

      expect(prepared).toHaveLength(2);
      expect(prepared[0]).toHaveProperty('hash');
      expect(prepared[0]).toHaveProperty('used', false);
    });

    it('各コードが正しくハッシュ化される', () => {
      const codes = ['ABCD-EF23'];
      const prepared = prepareCodesForStorage(codes);
      const expectedHash = hashRecoveryCode('ABCD-EF23');

      expect(prepared[0]?.hash).toBe(expectedHash);
    });
  });
});
