/**
 * Cookie同意管理システム
 *
 * ePrivacy Directive準拠のCookie同意管理
 * - localStorage使用（サーバーサイド対応不要）
 * - 3カテゴリ（必須・分析・マーケティング）
 * - 必須Cookieは常に有効（無効化不可）
 */

/** Cookieのカテゴリ種別 */
export type CookieCategory = 'necessary' | 'analytics' | 'marketing';

/** Cookie同意の状態を表すインターフェース */
export interface CookieConsent {
  necessary: boolean; // 常にtrue（無効化不可）
  analytics: boolean;
  marketing: boolean;
  timestamp: number; // 同意取得日時（UNIX timestamp）
}

const STORAGE_KEY = 'dayopt_cookie_consent';

/**
 * Cookie同意状態を取得
 *
 * @returns Cookie同意状態、または未設定の場合はnull
 */
export const getCookieConsent = (): CookieConsent | null => {
  if (typeof window === 'undefined') {
    return null; // SSR対応
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const consent = JSON.parse(stored) as CookieConsent;

    // 必須Cookieは常に有効
    consent.necessary = true;

    return consent;
  } catch {
    return null;
  }
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
    const newConsent: CookieConsent = {
      necessary: true, // 必須Cookieは常に有効
      analytics: consent.analytics ?? false,
      marketing: consent.marketing ?? false,
      timestamp: Date.now(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConsent));

    // カスタムイベント発火（他のコンポーネントで同意状態変更を検知可能）
    window.dispatchEvent(new CustomEvent('cookieConsentChanged', { detail: newConsent }));
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
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('cookieConsentChanged', { detail: null }));
  } catch {
    // localStorage操作失敗時は黙って無視
  }
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
 * 分析Cookieが有効か確認（Sentry用）
 */
export const isAnalyticsEnabled = (): boolean => {
  return isCookieCategoryEnabled('analytics');
};

/**
 * Cookie同意が必要か確認（バナー表示判定用）
 *
 * @returns 同意未取得の場合true
 */
export const needsCookieConsent = (): boolean => {
  return getCookieConsent() === null;
};

/**
 * Cookie同意状態変更イベントをリッスン
 *
 * @param callback 同意状態変更時のコールバック
 * @returns クリーンアップ関数
 */
export const onCookieConsentChange = (
  callback: (consent: CookieConsent | null) => void,
): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {}; // SSR対応
  }

  const handler = (event: CustomEvent<CookieConsent | null>) => {
    callback(event.detail);
  };

  window.addEventListener('cookieConsentChanged', handler as EventListener);

  return () => {
    window.removeEventListener('cookieConsentChanged', handler as EventListener);
  };
};
