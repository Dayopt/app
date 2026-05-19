import { env } from '@/platform/config/env';

/**
 * プライバシー保護ユーティリティ
 *
 * 個人情報（メールアドレス、電話番号など）を安全に扱うための関数群
 */

/**
 * メールアドレスをマスクする
 *
 * GDPR 対策: 個人を特定できる情報を保護しつつ、
 * サポート対応のために一部の情報は保持する
 *
 * @example
 * maskEmail('user@example.com') // 'u***@example.com'
 * maskEmail('john.doe@company.co.jp') // 'j***@company.co.jp'
 */
export function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');

  if (!localPart || !domain) {
    // 不正なメールアドレス形式
    return '***@***';
  }

  // ローカル部の最初の1文字のみ表示、残りは***
  const maskedLocal = localPart.length > 0 ? `${localPart[0]}***` : '***';

  return `${maskedLocal}@${domain}`;
}

/**
 * 名前をマスクする
 *
 * @example
 * maskName('山田太郎') // '山田***'
 * maskName('John Doe') // 'John ***'
 */
export function maskName(name: string): string {
  const parts = name.trim().split(/\s+/);

  if (parts.length === 0) {
    return '***';
  }

  // 最初の名前のみ表示、残りはマスク
  return `${parts[0]} ***`;
}

/**
 * SHA-256 ハッシュを生成（Web Crypto API 使用）
 *
 * 完全にプライバシーを保護する必要がある場合に使用
 */
export async function hashString(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * プライバシー保護モードが有効か確認
 *
 * 環境変数 PRIVACY_PROTECTION_MODE が 'strict' の場合、
 * より厳格なプライバシー保護を適用
 */
export function isStrictPrivacyMode(): boolean {
  return env.PRIVACY_PROTECTION_MODE === 'strict';
}
