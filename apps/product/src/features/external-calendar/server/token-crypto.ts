import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * 外部カレンダー接続の refresh token を AES-256-GCM で暗号化する。
 *
 * `calendar_connections.refresh_token_enc` は column-scoped GRANT で authenticated から
 * 読めないようにしてある（enforcement 層）。この暗号化はその上に載せる defense-in-depth で、
 * DB dump / logical backup が漏れた場合の保険。設計は overview.md §4-3。
 *
 * 鍵を env から直接読まず引数で受けるのは意図的。`@/env` の Proxy は NODE_ENV=test /
 * VITEST / CI / build の 4 条件で検証を丸ごとスキップし、getter は raw な `process.env[prop]`
 * を返すため、module scope で読むとテストが実行環境に依存する。
 */

/** GCM の推奨 IV 長。96 bit。 */
const IV_BYTES = 12;
/** GCM の認証タグ長。128 bit。 */
const AUTH_TAG_BYTES = 16;
/** AES-256 の鍵長。 */
const KEY_BYTES = 32;
/** payload の format version。鍵ローテーション時にここを上げて両対応させる。 */
const FORMAT_VERSION = 'v1';

export class TokenCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenCryptoError';
  }
}

/**
 * base64 の鍵文字列を 32 バイトの Buffer にする。
 *
 * env の値は Vercel から取得すると末尾に改行が残ることがあり、`@/env` の getter は
 * trim しないので呼び出し側の値をそのまま受けても壊れないよう内部で trim する。
 */
function decodeKey(keyBase64: string): Buffer {
  const key = Buffer.from(keyBase64.trim(), 'base64');

  if (key.length !== KEY_BYTES) {
    // 鍵そのものはエラーに含めない。
    throw new TokenCryptoError(
      `encryption key must decode to ${KEY_BYTES} bytes, got ${key.length}`,
    );
  }

  return key;
}

/** refresh token を `v1.<iv>.<authTag>.<ciphertext>`（各 base64url）へ暗号化する。 */
export function encryptToken(plaintext: string, keyBase64: string): string {
  if (plaintext.length === 0) {
    throw new TokenCryptoError('cannot encrypt an empty token');
  }

  const key = decodeKey(keyBase64);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    FORMAT_VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/**
 * `encryptToken` の逆。改竄されていれば GCM の認証で必ず失敗する。
 *
 * Step 2 では production の呼び出し元が無く、同期エンジン（Step 3）が最初の消費者になる。
 */
export function decryptToken(payload: string, keyBase64: string): string {
  const segments = payload.split('.');

  if (segments.length !== 4) {
    throw new TokenCryptoError('malformed encrypted token payload');
  }

  const [version, ivPart, authTagPart, ciphertextPart] = segments;

  if (
    version === undefined ||
    ivPart === undefined ||
    authTagPart === undefined ||
    ciphertextPart === undefined
  ) {
    throw new TokenCryptoError('malformed encrypted token payload');
  }

  if (version !== FORMAT_VERSION) {
    throw new TokenCryptoError(`unsupported encrypted token version: ${version}`);
  }

  const key = decodeKey(keyBase64);
  const iv = Buffer.from(ivPart, 'base64url');
  const authTag = Buffer.from(authTagPart, 'base64url');

  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new TokenCryptoError('malformed encrypted token payload');
  }

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // 復号失敗の詳細は攻撃者への情報になるため潰す。
    throw new TokenCryptoError('failed to decrypt token');
  }
}
