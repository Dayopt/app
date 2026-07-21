import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  acceptAllCookies,
  acceptNecessaryOnly,
  getCookieConsent,
  isCookieCategoryEnabled,
  needsCookieConsent,
  resetCookieConsent,
  setCookieConsent,
} from '../cookie-consent';

describe('cookie-consent', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('getCookieConsent', () => {
    it('未設定の場合はnull', () => {
      expect(getCookieConsent()).toBeNull();
    });

    it('保存された同意状態を取得', () => {
      setCookieConsent({ analytics: true, marketing: false });
      const consent = getCookieConsent();
      expect(consent).not.toBeNull();
      expect(consent!.necessary).toBe(true);
      expect(consent!.analytics).toBe(true);
      expect(consent!.marketing).toBe(false);
    });

    it('necessaryは常にtrue', () => {
      setCookieConsent({ analytics: false, marketing: false });
      const consent = getCookieConsent();
      expect(consent!.necessary).toBe(true);
    });

    it('localStorageが利用できない場合は未同意として扱う', () => {
      const storageSpy = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });

      expect(getCookieConsent()).toBeNull();
      expect(needsCookieConsent()).toBe(true);

      storageSpy.mockRestore();
    });
  });

  describe('setCookieConsent', () => {
    it('同意状態を保存', () => {
      setCookieConsent({ analytics: true });
      const consent = getCookieConsent();
      expect(consent!.analytics).toBe(true);
      expect(consent!.marketing).toBe(false);
    });

    it('timestampが設定される', () => {
      const before = Date.now();
      setCookieConsent({ analytics: true });
      const consent = getCookieConsent();
      expect(consent!.timestamp).toBeGreaterThanOrEqual(before);
    });
  });

  describe('acceptAllCookies', () => {
    it('全カテゴリを有効化', () => {
      acceptAllCookies();
      const consent = getCookieConsent();
      expect(consent!.analytics).toBe(true);
      expect(consent!.marketing).toBe(true);
    });
  });

  describe('acceptNecessaryOnly', () => {
    it('必須のみ有効化', () => {
      acceptNecessaryOnly();
      const consent = getCookieConsent();
      expect(consent!.necessary).toBe(true);
      expect(consent!.analytics).toBe(false);
      expect(consent!.marketing).toBe(false);
    });
  });

  describe('resetCookieConsent', () => {
    it('同意状態をリセット', () => {
      acceptAllCookies();
      resetCookieConsent();
      expect(getCookieConsent()).toBeNull();
    });

    it('resetをtelemetry拒否として通知する', () => {
      const handler = vi.fn();
      window.addEventListener('cookieConsentChanged', handler);

      resetCookieConsent();

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ detail: null }));
      window.removeEventListener('cookieConsentChanged', handler);
    });
  });

  describe('isCookieCategoryEnabled', () => {
    it('未同意時: necessaryのみtrue', () => {
      expect(isCookieCategoryEnabled('necessary')).toBe(true);
      expect(isCookieCategoryEnabled('analytics')).toBe(false);
      expect(isCookieCategoryEnabled('marketing')).toBe(false);
    });

    it('同意後: 設定に従う', () => {
      setCookieConsent({ analytics: true, marketing: false });
      expect(isCookieCategoryEnabled('analytics')).toBe(true);
      expect(isCookieCategoryEnabled('marketing')).toBe(false);
    });
  });

  describe('needsCookieConsent', () => {
    it('未設定ならtrue', () => {
      expect(needsCookieConsent()).toBe(true);
    });

    it('設定済みならfalse', () => {
      acceptAllCookies();
      expect(needsCookieConsent()).toBe(false);
    });
  });
});
