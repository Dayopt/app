/**
 * Encryption Unit Tests
 *
 * AES-GCM暗号化機能のユニットテスト
 * Web Crypto APIを使用したクライアントサイド暗号化の検証
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ApiKeyStorage,
  decryptData,
  deleteEncryptedData,
  encryptData,
  loadEncryptedData,
  saveEncryptedData,
} from '../encryption';

describe('Encryption Module', () => {
  describe('encryptData / decryptData', () => {
    const testSecret = 'test-user-id-12345';
    const testData = 'sensitive-api-key-xyz';

    it('should encrypt and decrypt data correctly', async () => {
      const encrypted = await encryptData(testData, testSecret);
      const decrypted = await decryptData(encrypted, testSecret);

      expect(decrypted).toBe(testData);
    });

    it('should produce different ciphertext for same input (random IV)', async () => {
      const encrypted1 = await encryptData(testData, testSecret);
      const encrypted2 = await encryptData(testData, testSecret);

      // 同じデータでもIVが異なるため、暗号文は異なる
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should return null when decrypting with wrong secret', async () => {
      const encrypted = await encryptData(testData, testSecret);
      const decrypted = await decryptData(encrypted, 'wrong-secret');

      expect(decrypted).toBeNull();
    });

    it('should return null for invalid encrypted data', async () => {
      const decrypted = await decryptData('invalid-base64-data', testSecret);

      expect(decrypted).toBeNull();
    });

    it('should handle empty string', async () => {
      const encrypted = await encryptData('', testSecret);
      const decrypted = await decryptData(encrypted, testSecret);

      expect(decrypted).toBe('');
    });

    it('should handle unicode characters', async () => {
      const unicodeData = '日本語テスト🔐';
      const encrypted = await encryptData(unicodeData, testSecret);
      const decrypted = await decryptData(encrypted, testSecret);

      expect(decrypted).toBe(unicodeData);
    });

    it('should handle long data', async () => {
      const longData = 'a'.repeat(10000);
      const encrypted = await encryptData(longData, testSecret);
      const decrypted = await decryptData(encrypted, testSecret);

      expect(decrypted).toBe(longData);
    });

    it('should produce base64 encoded output', async () => {
      const encrypted = await encryptData(testData, testSecret);

      // Base64文字のみを含む
      const base64Regex = /^[A-Za-z0-9+/=]+$/;
      expect(base64Regex.test(encrypted)).toBe(true);
    });
  });

  describe('localStorage Operations', () => {
    const testKey = 'test-key';
    const testData = 'test-data-value';
    const testSecret = 'test-secret-123';

    // localStorageのモック
    const localStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          store[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete store[key];
        }),
        clear: () => {
          store = {};
        },
      };
    })();

    beforeEach(() => {
      localStorageMock.clear();
      vi.stubGlobal('localStorage', localStorageMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    describe('saveEncryptedData', () => {
      it('should save encrypted data to localStorage', async () => {
        const result = await saveEncryptedData(testKey, testData, testSecret);

        expect(result).toBe(true);
        expect(localStorageMock.setItem).toHaveBeenCalled();

        // キーにプレフィックスが付いていることを確認
        const callArgs = localStorageMock.setItem.mock.calls[0];
        expect(callArgs?.[0]).toBe(`dayopt_encrypted_${testKey}`);
      });

      it('should return false on error', async () => {
        localStorageMock.setItem.mockImplementationOnce(() => {
          throw new Error('Storage full');
        });

        const result = await saveEncryptedData(testKey, testData, testSecret);

        expect(result).toBe(false);
      });
    });

    describe('loadEncryptedData', () => {
      it('should load and decrypt data from localStorage', async () => {
        await saveEncryptedData(testKey, testData, testSecret);
        const loaded = await loadEncryptedData(testKey, testSecret);

        expect(loaded).toBe(testData);
      });

      it('should return null for non-existent key', async () => {
        const loaded = await loadEncryptedData('non-existent', testSecret);

        expect(loaded).toBeNull();
      });

      it('should return null for corrupted data', async () => {
        localStorageMock.setItem(`dayopt_encrypted_${testKey}`, 'corrupted-data');
        const loaded = await loadEncryptedData(testKey, testSecret);

        expect(loaded).toBeNull();
      });
    });

    describe('deleteEncryptedData', () => {
      it('should remove data from localStorage', async () => {
        await saveEncryptedData(testKey, testData, testSecret);
        deleteEncryptedData(testKey);

        expect(localStorageMock.removeItem).toHaveBeenCalledWith(`dayopt_encrypted_${testKey}`);
      });
    });
  });

  describe('ApiKeyStorage', () => {
    const providerId = 'openai';
    const apiKey = 'sk-test-key-12345';
    const userId = 'user-123';

    // localStorageのモック
    const localStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: vi.fn((key: string) => store[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          store[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete store[key];
        }),
        clear: () => {
          store = {};
        },
      };
    })();

    beforeEach(() => {
      localStorageMock.clear();
      vi.stubGlobal('localStorage', localStorageMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    describe('save', () => {
      it('should save API key with provider-specific key', async () => {
        const result = await ApiKeyStorage.save(providerId, apiKey, userId);

        expect(result).toBe(true);
        expect(localStorageMock.setItem).toHaveBeenCalled();
      });
    });

    describe('load', () => {
      it('should load and decrypt API key', async () => {
        await ApiKeyStorage.save(providerId, apiKey, userId);
        const loaded = await ApiKeyStorage.load(providerId, userId);

        expect(loaded).toBe(apiKey);
      });

      it('should return null for non-existent provider', async () => {
        const loaded = await ApiKeyStorage.load('non-existent', userId);

        expect(loaded).toBeNull();
      });

      it('should return null with wrong userId', async () => {
        await ApiKeyStorage.save(providerId, apiKey, userId);
        const loaded = await ApiKeyStorage.load(providerId, 'wrong-user');

        expect(loaded).toBeNull();
      });
    });

    describe('delete', () => {
      it('should delete API key', async () => {
        await ApiKeyStorage.save(providerId, apiKey, userId);
        ApiKeyStorage.delete(providerId);

        expect(localStorageMock.removeItem).toHaveBeenCalledWith(
          `dayopt_encrypted_api_key_${providerId}`,
        );
      });
    });

    describe('exists', () => {
      it('should return true when API key exists', async () => {
        await ApiKeyStorage.save(providerId, apiKey, userId);
        const exists = ApiKeyStorage.exists(providerId);

        expect(exists).toBe(true);
      });

      it('should return false when API key does not exist', () => {
        const exists = ApiKeyStorage.exists('non-existent');

        expect(exists).toBe(false);
      });
    });
  });

  describe('Security Properties', () => {
    const testSecret = 'security-test-secret';

    it('should use AES-GCM (authenticated encryption)', async () => {
      // AES-GCMは認証付き暗号化なので、改ざんを検出できる
      const encrypted = await encryptData('test', testSecret);

      // 暗号文を改ざん
      const bytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
      const lastIndex = bytes.length - 1;
      const lastByte = bytes[lastIndex];
      if (lastIndex >= 0 && lastByte !== undefined) {
        bytes[lastIndex] = lastByte ^ 0xff; // 最後のバイトを反転
      }
      const tampered = btoa(String.fromCharCode(...bytes));

      // 改ざんされたデータの復号は失敗するはず
      const result = await decryptData(tampered, testSecret);
      expect(result).toBeNull();
    });

    it('should include IV in output (12 bytes minimum)', async () => {
      const encrypted = await encryptData('test', testSecret);
      const bytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

      // 最小長: 12バイト(IV) + 4バイト(最小暗号文) + 16バイト(認証タグ)
      expect(bytes.length).toBeGreaterThanOrEqual(12 + 4 + 16);
    });

    it('should derive key from secret using PBKDF2', async () => {
      // 同じシークレットからは同じキーが導出される（同じデータが復号可能）
      const data = 'test data for key derivation';
      const encrypted = await encryptData(data, testSecret);
      const decrypted = await decryptData(encrypted, testSecret);

      expect(decrypted).toBe(data);
    });
  });
});
