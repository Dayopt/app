/**
 * Cookie同意管理システム
 *
 * ePrivacy Directive準拠のCookie同意管理
 * - localStorage使用（サーバーサイド対応不要）
 * - 3カテゴリ（必須・分析・マーケティング）
 * - 必須Cookieは常に有効（無効化不可）
 */

import {
  BROWSER_TELEMETRY_CONSENT_EVENT,
  BROWSER_TELEMETRY_CONSENT_STORAGE_KEY,
  getBrowserTelemetryConsentStorage,
  readBrowserTelemetryConsent,
  type BrowserTelemetryConsent,
} from '@dayopt/observability';

/** Cookieのカテゴリ種別 */
type CookieCategory = 'necessary' | 'analytics' | 'marketing';

/** Cookie同意の状態を表すインターフェース */
type CookieConsent = BrowserTelemetryConsent;

/**
 * Cookie同意状態を取得
 *
 * @returns Cookie同意状態、または未設定の場合はnull
 */
export const getCookieConsent = (): CookieConsent | null => {
  if (typeof window === 'undefined') {
    return null; // SSR対応
  }

  return readBrowserTelemetryConsent(getBrowserTelemetryConsentStorage());
};

/**
 * Cookie同意状態を保存
 *
 * @param consent Cookie同意状態
 */
export const setCookieConsent = (
  consent: Partial<Omit<CookieConsent, 'necessary' | 'timestamp'>>,
): void => {
  if (typeof window === 'undefined') {
    return; // SSR対応
  }

  try {
    const storage = getBrowserTelemetryConsentStorage();
    if (!storage) return;

    const newConsent: CookieConsent = {
      necessary: true, // 必須Cookieは常に有効
      analytics: consent.analytics ?? false,
      marketing: consent.marketing ?? false,
      timestamp: Date.now(),
    };

    storage.setItem(BROWSER_TELEMETRY_CONSENT_STORAGE_KEY, JSON.stringify(newConsent));

    // カスタムイベント発火（他のコンポーネントで同意状態変更を検知可能）
    window.dispatchEvent(new CustomEvent(BROWSER_TELEMETRY_CONSENT_EVENT, { detail: newConsent }));
  } catch {
    // localStorage書き込み失敗時は黙って無視
  }
};

/**
 * すべてのCookieを受け入れる
 */
export const acceptAllCookies = (): void => {
  setCookieConsent({
    analytics: true,
    marketing: true,
  });
};

/**
 * 必須Cookieのみ受け入れる（分析・マーケティングは拒否）
 */
export const acceptNecessaryOnly = (): void => {
  setCookieConsent({
    analytics: false,
    marketing: false,
  });
};

/**
 * Cookie同意状態をリセット（同意バナー再表示用）
 */
export const resetCookieConsent = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    getBrowserTelemetryConsentStorage()?.removeItem(BROWSER_TELEMETRY_CONSENT_STORAGE_KEY);
  } catch {
    // localStorage操作失敗時も、実行中telemetryの停止通知は続行する
  }

  window.dispatchEvent(new CustomEvent(BROWSER_TELEMETRY_CONSENT_EVENT, { detail: null }));
};

/**
 * 特定カテゴリのCookieが有効か確認
 *
 * @param category Cookieカテゴリ
 * @returns 有効な場合true
 */
export const isCookieCategoryEnabled = (category: CookieCategory): boolean => {
  const consent = getCookieConsent();

  if (!consent) {
    // 同意未取得の場合、必須Cookieのみ有効
    return category === 'necessary';
  }

  return consent[category] ?? false;
};

/**
 * Cookie同意が必要か確認（バナー表示判定用）
 *
 * @returns 同意未取得の場合true
 */
export const needsCookieConsent = (): boolean => {
  return getCookieConsent() === null;
};
