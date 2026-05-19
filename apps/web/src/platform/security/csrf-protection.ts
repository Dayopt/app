import { env } from '@/platform/config/env';
import { NextRequest } from 'next/server';

/**
 * CSRF 保護ミドルウェア
 *
 * Origin/Referer ヘッダーをチェックして、リクエストが同一ドメインから来ているか検証します。
 * POST, PUT, PATCH, DELETE リクエストに適用します。
 *
 * OWASP A01:2021 - Broken Access Control 対策
 */

/**
 * 許可されたオリジンのリスト
 *
 * 本番環境: vercel.app ドメインと本番ドメイン
 * 開発環境: localhost
 */
function getAllowedOrigins(): string[] {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ];

  // Vercel のプレビュー/本番環境
  if (env.VERCEL_URL) {
    allowedOrigins.push(`https://${env.VERCEL_URL}`);
  }

  // 本番ドメイン
  if (env.NEXT_PUBLIC_APP_URL) {
    allowedOrigins.push(env.NEXT_PUBLIC_APP_URL);
  }

  // デフォルトの本番ドメイン
  allowedOrigins.push('https://dayopt.app', 'https://www.dayopt.app');

  return allowedOrigins;
}

/**
 * Origin ヘッダーが許可されているか検証
 */
function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;

  const allowedOrigins = getAllowedOrigins();

  // 完全一致チェック
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  // Vercel プレビュー URL のパターンマッチ（*.vercel.app）
  if (origin.match(/^https:\/\/.*\.vercel\.app$/)) {
    return true;
  }

  return false;
}

/**
 * Referer ヘッダーが許可されているか検証
 */
function isRefererAllowed(referer: string | null): boolean {
  if (!referer) return false;

  try {
    const refererUrl = new URL(referer);
    const refererOrigin = refererUrl.origin;
    return isOriginAllowed(refererOrigin);
  } catch {
    return false;
  }
}

/**
 * CSRF トークンを検証
 *
 * - GET, HEAD, OPTIONS は検証不要（安全なメソッド）
 * - POST, PUT, PATCH, DELETE は Origin/Referer をチェック
 *
 * @returns {boolean} true: 検証成功, false: 検証失敗
 */
export function verifyCsrfToken(request: NextRequest): boolean {
  const method = request.method;

  // 安全なメソッドは検証不要
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return true;
  }

  // Origin ヘッダーチェック（優先）
  const origin = request.headers.get('origin');
  if (origin) {
    return isOriginAllowed(origin);
  }

  // Referer ヘッダーチェック（フォールバック）
  const referer = request.headers.get('referer');
  if (referer) {
    return isRefererAllowed(referer);
  }

  // Origin も Referer もない場合は拒否
  // ただし、開発環境では警告のみ
  if (env.NODE_ENV === 'development') {
    console.warn('[CSRF] No Origin or Referer header found, but allowing in development');
    return true;
  }

  return false;
}

/**
 * CSRF 検証エラーレスポンスを生成
 *
 * デバッグ情報を含む詳細なエラーメッセージを返します。
 */
export function csrfVerificationDetails(request: NextRequest): {
  valid: boolean;
  reason?: string;
  origin?: string;
  referer?: string;
  allowedOrigins: string[];
} {
  const method = request.method;
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const allowedOrigins = getAllowedOrigins();

  // 安全なメソッド
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return { valid: true, allowedOrigins };
  }

  // Origin チェック
  if (origin) {
    if (isOriginAllowed(origin)) {
      return { valid: true, origin, allowedOrigins };
    }
    return {
      valid: false,
      reason: 'Origin not allowed',
      origin,
      allowedOrigins,
    };
  }

  // Referer チェック
  if (referer) {
    if (isRefererAllowed(referer)) {
      return { valid: true, referer, allowedOrigins };
    }
    return {
      valid: false,
      reason: 'Referer not allowed',
      referer,
      allowedOrigins,
    };
  }

  // ヘッダーなし
  return {
    valid: env.NODE_ENV === 'development',
    reason: 'Missing Origin and Referer headers',
    allowedOrigins,
  };
}
