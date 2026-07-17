import {
  BROWSER_TELEMETRY_CONSENT_EVENT,
  BROWSER_TELEMETRY_CONSENT_STORAGE_KEY,
  readBrowserTelemetryConsent,
  type BrowserTelemetryConsent,
} from '@dayopt/observability';

interface ConsentEnvironment {
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  now: () => number;
  notify: (consent: BrowserTelemetryConsent) => void;
}

function getBrowserConsentEnvironment(): ConsentEnvironment | null {
  if (typeof window === 'undefined') return null;

  try {
    return {
      storage: window.localStorage,
      now: Date.now,
      notify: (consent) => {
        window.dispatchEvent(new CustomEvent(BROWSER_TELEMETRY_CONSENT_EVENT, { detail: consent }));
      },
    };
  } catch {
    return null;
  }
}

export function needsBrowserTelemetryConsent(storage?: Pick<Storage, 'getItem'>): boolean {
  if (storage) return readBrowserTelemetryConsent(storage) === null;
  if (typeof window === 'undefined') return false;

  try {
    return readBrowserTelemetryConsent(window.localStorage) === null;
  } catch {
    return false;
  }
}

export function persistBrowserTelemetryConsent(
  analytics: boolean,
  environment: ConsentEnvironment | null = getBrowserConsentEnvironment(),
): void {
  if (!environment) return;

  const consent: BrowserTelemetryConsent = {
    necessary: true,
    analytics,
    // Dayopt does not currently use marketing cookies.
    marketing: false,
    timestamp: environment.now(),
  };

  try {
    environment.storage.setItem(BROWSER_TELEMETRY_CONSENT_STORAGE_KEY, JSON.stringify(consent));
    environment.notify(consent);
  } catch {
    // Privacy-preserving default: telemetry stays disabled when storage is unavailable.
  }
}
