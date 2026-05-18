/**
 * クライアントサイド暗号化ユーティリティ
 *
 * Web Crypto APIを使用してAPI keyなどの機密データを暗号化
 * AES-GCM方式を使用（OWASP推奨）
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits, recommended for AES-GCM
const STORAGE_PREFIX = 'dayopt_encrypted_';

/**
 * 暗号化キーを導出
 *
 * ユーザー固有のシークレット（ユーザーID等）からAESキーを生成
 */
async function deriveKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('dayopt-salt-v1'), // アプリ固有のソルト
      iterations: 100000, // OWASP推奨値
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * データを暗号化
 *
 * @param data 暗号化するデータ
 * @param secret ユーザー固有のシークレット（ユーザーID推奨）
 * @returns Base64エンコードされた暗号化データ（IV + 暗号文）
 */
export async function encryptData(data: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const encrypted = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoder.encode(data));

  // IV + 暗号化データを結合してBase64エンコード
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * データを復号
 *
 * @param encryptedData Base64エンコードされた暗号化データ
 * @param secret ユーザー固有のシークレット
 * @returns 復号されたデータ、失敗時はnull
 */
export async function decryptData(encryptedData: string, secret: string): Promise<string | null> {
  try {
    const key = await deriveKey(secret);
    const combined = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0));

    const iv = combined.slice(0, IV_LENGTH);
    const data = combined.slice(IV_LENGTH);

    const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, data);

    return new TextDecoder().decode(decrypted);
  } catch {
    // 復号失敗（鍵不一致、データ破損等）
    return null;
  }
}

/**
 * 暗号化データをlocalStorageに保存
 *
 * @param key 保存キー名
 * @param data 保存するデータ
 * @param secret ユーザー固有のシークレット
 */
export async function saveEncryptedData(
  key: string,
  data: string,
  secret: string,
): Promise<boolean> {
  try {
    const encrypted = await encryptData(data, secret);
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, encrypted);
    return true;
  } catch {
    return false;
  }
}

/**
 * localStorageから暗号化データを読み込み・復号
 *
 * @param key 保存キー名
 * @param secret ユーザー固有のシークレット
 * @returns 復号されたデータ、存在しないか失敗時はnull
 */
export async function loadEncryptedData(key: string, secret: string): Promise<string | null> {
  try {
    const encrypted = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!encrypted) return null;

    return await decryptData(encrypted, secret);
  } catch {
    return null;
  }
}

/**
 * 暗号化データを削除
 *
 * @param key 保存キー名
 */
export function deleteEncryptedData(key: string): void {
  localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
}

/**
 * APIキー用のヘルパー関数
 */
export const ApiKeyStorage = {
  /**
   * APIキーを保存
   */
  async save(providerId: string, apiKey: string, userId: string): Promise<boolean> {
    return saveEncryptedData(`api_key_${providerId}`, apiKey, userId);
  },

  /**
   * APIキーを読み込み
   */
  async load(providerId: string, userId: string): Promise<string | null> {
    return loadEncryptedData(`api_key_${providerId}`, userId);
  },

  /**
   * APIキーを削除
   */
  delete(providerId: string): void {
    deleteEncryptedData(`api_key_${providerId}`);
  },

  /**
   * APIキーが保存されているか確認
   */
  exists(providerId: string): boolean {
    return localStorage.getItem(`${STORAGE_PREFIX}api_key_${providerId}`) !== null;
  },
};
