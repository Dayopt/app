import type { Page } from '@playwright/test';

/**
 * Cookie 同意バナーを出さないよう、ページ評価前に同意状態を localStorage へ入れる。
 *
 * バナーは modal dialog として前面に出るため、出た後の click / drag は
 * pointer-events を奪われて失敗する。表示までに数百 ms の間があるので、
 * 待機を 1 つ足しただけでテストが「間に合っていた」側から「間に合わない」側へ
 * 倒れる。競争させず、最初から出さないのが安定する唯一の形。
 *
 * key と shape は `packages/observability/src/consent.ts` の
 * `BROWSER_TELEMETRY_CONSENT_STORAGE_KEY` / `apps/product/src/lib/cookie-consent.ts`
 * の `CookieConsent` に対応する。analytics / marketing は false（必要最小限）。
 */
const CONSENT_STORAGE_KEY = 'dayopt_cookie_consent';

export async function suppressConsentBanner(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    try {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          necessary: true,
          analytics: false,
          marketing: false,
          timestamp: Date.now(),
        }),
      );
    } catch {
      // localStorage が使えない環境では素通しする（バナーは出るが test 自体は続行）
    }
  }, CONSENT_STORAGE_KEY);
}
