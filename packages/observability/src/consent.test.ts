import { describe, expect, it } from 'vitest';

import {
  BROWSER_TELEMETRY_CONSENT_STORAGE_KEY,
  hasAnalyticsConsent,
  isAnalyticsConsentDetail,
  isBrowserTelemetryConsentStorageChange,
  readBrowserTelemetryConsent,
  resolveAnalyticsConsentDetail,
} from './consent';

function storageWith(value: string | null) {
  return {
    getItem(key: string): string | null {
      expect(key).toBe(BROWSER_TELEMETRY_CONSENT_STORAGE_KEY);
      return value;
    },
  };
}

describe('browser telemetry consent', () => {
  it('distinguishes an explicit analytics refusal from missing consent', () => {
    const consent = readBrowserTelemetryConsent(
      storageWith(
        JSON.stringify({ necessary: true, analytics: false, marketing: false, timestamp: 1 }),
      ),
    );

    expect(consent).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
      timestamp: 1,
    });
    expect(hasAnalyticsConsent(storageWith(null))).toBe(false);
  });

  it('accepts only the existing complete storage shape', () => {
    expect(
      hasAnalyticsConsent(
        storageWith(
          JSON.stringify({ necessary: true, analytics: true, marketing: false, timestamp: 1 }),
        ),
      ),
    ).toBe(true);
    expect(hasAnalyticsConsent(storageWith('{broken'))).toBe(false);
    expect(
      hasAnalyticsConsent(
        storageWith(JSON.stringify({ necessary: false, analytics: true, timestamp: 1 })),
      ),
    ).toBe(false);
  });

  it('validates consent event details', () => {
    expect(
      isAnalyticsConsentDetail({
        necessary: true,
        analytics: true,
        marketing: false,
        timestamp: 1,
      }),
    ).toBe(true);
    expect(isAnalyticsConsentDetail({ analytics: true })).toBe(false);
    expect(isAnalyticsConsentDetail(null)).toBe(false);
    expect(resolveAnalyticsConsentDetail(null)).toBe(false);
    expect(resolveAnalyticsConsentDetail({ analytics: false })).toBeNull();
  });

  it('recognizes cross-tab consent changes and storage.clear()', () => {
    expect(isBrowserTelemetryConsentStorageChange(BROWSER_TELEMETRY_CONSENT_STORAGE_KEY)).toBe(
      true,
    );
    expect(isBrowserTelemetryConsentStorageChange(null)).toBe(true);
    expect(isBrowserTelemetryConsentStorageChange('unrelated')).toBe(false);
  });
});
