/**
 * オープンリダイレクト防止ユーティリティ
 *
 * 認証コールバック等で使用する `next` パラメータを検証し、
 * 外部サイトへのリダイレクトを防止する。
 *
 * @see OWASP - Unvalidated Redirects and Forwards
 */

/**
 * リダイレクト先パスを検証し、安全な相対パスのみ許可する。
 *
 * 拒否されるパターン:
 * - 絶対URL (`https://evil.com`)
 * - プロトコル相対URL (`//evil.com`)
 * - エンコードされたバイパス (`%2F%2Fevil.com`)
 * - raw / encoded backslash (`/%5C%5Cevil.com`)
 */
export function getSafeRedirectPath(next: string | null, fallback = '/calendar'): string {
  if (!next) return fallback;

  // 相対パスでない、またはプロトコル相対URL
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;
  if (next.includes('\\')) return fallback;

  // エンコードされたバイパスを検出
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  if (decoded.startsWith('//') || decoded.includes('://') || decoded.includes('\\')) {
    return fallback;
  }

  const appOrigin = 'https://app.dayopt.app';
  try {
    const parsed = new URL(decoded, appOrigin);
    if (parsed.origin !== appOrigin) return fallback;
  } catch {
    return fallback;
  }

  return next;
}
