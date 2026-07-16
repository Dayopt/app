/** The existing storage contract is shared by Product and Web. */
export const BROWSER_TELEMETRY_CONSENT_STORAGE_KEY = 'dayopt_cookie_consent';

/** Browser event dispatched after the stored consent changes. */
export const BROWSER_TELEMETRY_CONSENT_EVENT = 'cookieConsentChanged';

export interface BrowserTelemetryConsent {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  timestamp: number;
}

export interface BrowserTelemetryConsentStorage {
  getItem(key: string): string | null;
}

export interface BrowserTelemetryConsentWritableStorage extends BrowserTelemetryConsentStorage {
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Resolves browser storage without letting privacy-mode SecurityError escape. */
export function getBrowserTelemetryConsentStorage(): BrowserTelemetryConsentWritableStorage | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseBrowserTelemetryConsent(value: unknown): BrowserTelemetryConsent | null {
  if (!isRecord(value)) return null;
  if (value.necessary !== true) return null;
  if (typeof value.analytics !== 'boolean') return null;
  if (typeof value.marketing !== 'boolean') return null;
  if (typeof value.timestamp !== 'number' || !Number.isFinite(value.timestamp)) return null;

  return {
    necessary: true,
    analytics: value.analytics,
    marketing: value.marketing,
    timestamp: value.timestamp,
  };
}

/**
 * Reads the existing consent payload without changing its storage key or shape.
 * Missing, inaccessible, malformed, or stale-shape values are treated as no consent.
 */
export function readBrowserTelemetryConsent(
  storage: BrowserTelemetryConsentStorage | null | undefined,
): BrowserTelemetryConsent | null {
  if (!storage) return null;

  try {
    const stored = storage.getItem(BROWSER_TELEMETRY_CONSENT_STORAGE_KEY);
    if (!stored) return null;
    return parseBrowserTelemetryConsent(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent(
  storage: BrowserTelemetryConsentStorage | null | undefined,
): boolean {
  return readBrowserTelemetryConsent(storage)?.analytics === true;
}

/** A storage event for this key, or storage.clear(), can change browser telemetry consent. */
export function isBrowserTelemetryConsentStorageChange(key: string | null): boolean {
  return key === null || key === BROWSER_TELEMETRY_CONSENT_STORAGE_KEY;
}

/** Validates the detail carried by `cookieConsentChanged`. */
export function isAnalyticsConsentDetail(value: unknown): boolean {
  return parseBrowserTelemetryConsent(value)?.analytics === true;
}

/**
 * Resolves a consent-change event. `null` means an explicit reset/revocation;
 * other malformed payloads are ignored by returning `null` as the decision.
 */
export function resolveAnalyticsConsentDetail(value: unknown): boolean | null {
  if (value === null) return false;
  const consent = parseBrowserTelemetryConsent(value);
  return consent ? consent.analytics : null;
}
