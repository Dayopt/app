import { createDecipheriv, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  decryptToken,
  encryptToken,
  isValidEncryptionKey,
  TokenCryptoError,
} from '../token-crypto';

const KEY = randomBytes(32).toString('base64');
const OTHER_KEY = randomBytes(32).toString('base64');
const REFRESH_TOKEN = '1//0abcdefghijklmnop-refresh-token';

describe('token-crypto', () => {
  it('暗号化した token を復号すると元に戻る', () => {
    const encrypted = encryptToken(REFRESH_TOKEN, KEY);

    expect(encrypted).not.toContain(REFRESH_TOKEN);
    expect(decryptToken(encrypted, KEY)).toBe(REFRESH_TOKEN);
  });

  it('同じ平文でも毎回異なる暗号文になる（IV がランダム）', () => {
    expect(encryptToken(REFRESH_TOKEN, KEY)).not.toBe(encryptToken(REFRESH_TOKEN, KEY));
  });

  it('payload は v1.<iv>.<tag>.<ciphertext> の形式で、node:crypto から直接復号できる', () => {
    const [version, ivPart, tagPart, ciphertextPart] = encryptToken(REFRESH_TOKEN, KEY).split('.');

    expect(version).toBe('v1');
    expect(Buffer.from(ivPart ?? '', 'base64url')).toHaveLength(12);
    expect(Buffer.from(tagPart ?? '', 'base64url')).toHaveLength(16);

    // 自作の逆関数を通さず独立に検証する
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(KEY, 'base64'),
      Buffer.from(ivPart ?? '', 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagPart ?? '', 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart ?? '', 'base64url')),
      decipher.final(),
    ]).toString('utf8');

    expect(decrypted).toBe(REFRESH_TOKEN);
  });

  it('暗号文を改竄すると認証タグ検証で失敗する', () => {
    const segments = encryptToken(REFRESH_TOKEN, KEY).split('.');
    const tampered = Buffer.from(segments[3] ?? '', 'base64url');
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    segments[3] = tampered.toString('base64url');

    expect(() => decryptToken(segments.join('.'), KEY)).toThrow(TokenCryptoError);
  });

  it('別の鍵では復号できない', () => {
    expect(() => decryptToken(encryptToken(REFRESH_TOKEN, KEY), OTHER_KEY)).toThrow(
      TokenCryptoError,
    );
  });

  it('鍵長が 32 バイトでなければ拒否する', () => {
    const shortKey = randomBytes(16).toString('base64');

    expect(() => encryptToken(REFRESH_TOKEN, shortKey)).toThrow(TokenCryptoError);
    expect(() => decryptToken(encryptToken(REFRESH_TOKEN, KEY), shortKey)).toThrow(
      TokenCryptoError,
    );
  });

  it('鍵の前後の空白・改行を無視する（Vercel から取得した値の末尾改行対策）', () => {
    expect(decryptToken(encryptToken(REFRESH_TOKEN, `${KEY}\n`), ` ${KEY} `)).toBe(REFRESH_TOKEN);
  });

  it('空の token は暗号化しない', () => {
    expect(() => encryptToken('', KEY)).toThrow(TokenCryptoError);
  });

  describe('isValidEncryptionKey', () => {
    it('32 バイトへ decode できる鍵だけを受け入れる', () => {
      expect(isValidEncryptionKey(KEY)).toBe(true);
      expect(isValidEncryptionKey(`${KEY}\n`)).toBe(true);
    });

    it.each([
      ['未設定', undefined],
      ['空文字', ''],
      ['空白のみ', '   '],
      ['16 バイト', randomBytes(16).toString('base64')],
      ['64 バイト', randomBytes(64).toString('base64')],
    ])('壊れた鍵を拒否する: %s', (_label, key) => {
      expect(isValidEncryptionKey(key)).toBe(false);
    });
  });

  it.each([
    ['セグメント数が足りない', 'v1.aaa.bbb'],
    ['未知のバージョン', 'v2.aaa.bbb.ccc'],
    ['IV 長が不正', 'v1.YWJj.YWJjZGVmZ2hpamtsbW5vcA.YWJj'],
    ['空文字', ''],
  ])('壊れた payload を拒否する: %s', (_label, payload) => {
    expect(() => decryptToken(payload, KEY)).toThrow(TokenCryptoError);
  });
});
